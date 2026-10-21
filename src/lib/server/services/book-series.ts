import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { TitleDetails } from '$lib/catalog/types';
import { getDb } from '../db/client';
import {
	activityEvents,
	episodes,
	libraryEntries,
	titles,
	users,
	type UserPrefs
} from '../db/schema';
import { readLocale, seriesForBook } from './adaptations';
import { getTitle } from './catalog';
import { getEntry, removeEntry, setStatus } from './library';
import { ensureTitle, getTitleRow, type TitleRow } from './titles';
import { applyAutoStatus } from './tracking';

/**
 * Books that belong to a series are tracked through the series, like episodes of a show. These
 * helpers move tracking recorded on a single book into its series, and manage series grouped by
 * hand ("collections") for books Wikidata doesn't know as a series.
 */

type Episode = typeof episodes.$inferSelect;

/** The unit of a series (Wikidata or hand-made) that is this Open Library work. */
function unitForWork(seriesId: number, work: string): Episode | undefined {
	return getDb()
		.select()
		.from(episodes)
		.where(and(eq(episodes.titleId, seriesId), eq(episodes.externalId, work)))
		.get();
}

/**
 * Moves a user's reads, page and status for one book into the series it belongs to. The book
 * leaves the library; its history now shows as that book of the series. Returns whether anything
 * moved.
 */
export function absorbBook(
	userId: number,
	book: TitleRow,
	series: TitleRow,
	unit: Episode,
	prefs: UserPrefs
): boolean {
	const db = getDb();
	const entry = getEntry(userId, book.id);
	const events = db
		.select({ id: activityEvents.id })
		.from(activityEvents)
		.where(and(eq(activityEvents.userId, userId), eq(activityEvents.titleId, book.id)))
		.all();
	if (!entry && events.length === 0) return false;

	db.transaction(() => {
		if (events.length) {
			db.update(activityEvents)
				.set({ titleId: series.id, unitId: unit.id })
				.where(
					inArray(
						activityEvents.id,
						events.map((e) => e.id)
					)
				)
				.run();
			// The first read of the book is the read; later ones are rereads.
			const reads = db
				.select({ id: activityEvents.id })
				.from(activityEvents)
				.where(and(eq(activityEvents.userId, userId), eq(activityEvents.unitId, unit.id)))
				.orderBy(asc(activityEvents.occurredAt), asc(activityEvents.id))
				.all();
			reads.forEach((read, i) =>
				db
					.update(activityEvents)
					.set({ isRepeat: i > 0 })
					.where(eq(activityEvents.id, read.id))
					.run()
			);
		}

		const seriesEntry = getEntry(userId, series.id);
		if (!seriesEntry) {
			// A finished book means the series is started, not finished (auto status decides).
			const status = entry && entry.status !== 'completed' ? entry.status : 'in_progress';
			setStatus(userId, series.id, status);
		}
		// An unfinished book's page carries over when the series has no page in progress.
		const page = entry?.progress?.page;
		const current = getEntry(userId, series.id)!;
		if (typeof page === 'number' && page > 0 && events.length === 0 && !current.progress?.unit) {
			db.update(libraryEntries)
				.set({
					progress: {
						...(current.progress ?? {}),
						page,
						unit: { season: unit.seasonNumber, number: unit.number }
					}
				})
				.where(eq(libraryEntries.id, current.id))
				.run();
		}
		const last = [entry?.lastActivityAt, current.lastActivityAt]
			.filter((d): d is Date => !!d)
			.sort((a, b) => b.getTime() - a.getTime())[0];
		if (last) {
			db.update(libraryEntries)
				.set({ lastActivityAt: last })
				.where(eq(libraryEntries.id, current.id))
				.run();
		}
		if (entry) removeEntry(userId, book.id);
	});

	applyAutoStatus(userId, series, prefs, 'refresh');
	return true;
}

/** The hand-made series a book was added to, if any. */
export function collectionOfWork(work: string): { title: TitleRow; unit: Episode } | null {
	const row = getDb()
		.select({ title: titles, unit: episodes })
		.from(episodes)
		.innerJoin(titles, eq(titles.id, episodes.titleId))
		.where(and(eq(titles.kind, 'collection'), eq(episodes.externalId, work)))
		.get();
	return row ?? null;
}

/**
 * Moves a book into its series if it belongs to one (Wikidata first, then hand-made series).
 * Safe to call often: it only does work when the user tracked the book on its own.
 */
export async function absorbIntoSeries(
	userId: number,
	book: TitleRow,
	prefs: UserPrefs
): Promise<boolean> {
	if (book.kind !== 'book') return false;
	const hasEntry = !!getEntry(userId, book.id);
	const hasEvents = !!getDb()
		.select({ id: activityEvents.id })
		.from(activityEvents)
		.where(and(eq(activityEvents.userId, userId), eq(activityEvents.titleId, book.id)))
		.limit(1)
		.get();
	if (!hasEntry && !hasEvents) return false;

	const locale = readLocale(prefs);
	const membership = await seriesForBook(book.externalId, locale.language);
	if (membership) {
		const series = await ensureTitle('series', membership.series, locale).catch(() => null);
		const unit = series && unitForWork(series.id, book.externalId);
		if (series && unit) return absorbBook(userId, book, series, unit, prefs);
	}
	const collection = collectionOfWork(book.externalId);
	if (collection) return absorbBook(userId, book, collection.title, collection.unit, prefs);
	return false;
}

/** Every user's single books that turned out to be part of a series (daily job). */
export async function absorbAllBooks(): Promise<string> {
	const db = getDb();
	const pairs = new Map<string, { userId: number; titleId: number }>();
	const add = (userId: number, titleId: number) =>
		pairs.set(`${userId}:${titleId}`, { userId, titleId });
	for (const row of db
		.select({ userId: libraryEntries.userId, titleId: libraryEntries.titleId })
		.from(libraryEntries)
		.innerJoin(titles, eq(titles.id, libraryEntries.titleId))
		.where(eq(titles.kind, 'book'))
		.all())
		add(row.userId, row.titleId);
	for (const row of db
		.selectDistinct({ userId: activityEvents.userId, titleId: activityEvents.titleId })
		.from(activityEvents)
		.innerJoin(titles, eq(titles.id, activityEvents.titleId))
		.where(eq(titles.kind, 'book'))
		.all())
		add(row.userId, row.titleId);

	let moved = 0;
	for (const { userId, titleId } of pairs.values()) {
		const book = getTitleRow(titleId);
		const user = db.select({ prefs: users.prefs }).from(users).where(eq(users.id, userId)).get();
		if (!book || !user) continue;
		try {
			if (await absorbIntoSeries(userId, book, user.prefs)) moved++;
		} catch (error) {
			console.warn(`[book-series] ${book.name}: ${String(error)}`);
		}
	}
	return `moved ${moved} of ${pairs.size} books into their series`;
}

// ---------- Hand-made series ----------

export class CollectionError extends Error {}

/** Adds a book to a hand-made series at a position (replacing whatever was there). */
async function addBook(
	collection: TitleRow,
	work: string,
	number: number,
	locale = readLocale({})
) {
	const lookup = await getTitle('book', work, locale);
	if (!('title' in lookup)) throw new CollectionError('Book not found');
	const book: TitleDetails = lookup.title;
	const db = getDb();
	if (collectionOfWork(work)) throw new CollectionError('This book is already in a series');
	const taken = db
		.select({ name: episodes.name })
		.from(episodes)
		.where(and(eq(episodes.titleId, collection.id), eq(episodes.number, number)))
		.get();
	if (taken) throw new CollectionError(`Book ${number} is already “${taken.name}”`);
	db.insert(episodes)
		.values({
			titleId: collection.id,
			seasonNumber: 1,
			number,
			name: book.name,
			still: book.poster,
			airDate: book.startDate ?? '1900-01-01',
			pages: book.pages,
			externalId: work
		})
		.run();
	refreshCollection(collection.id);
}

/** Keeps the season row, count and cover in step with the books. */
function refreshCollection(titleId: number) {
	const db = getDb();
	const list = db
		.select()
		.from(episodes)
		.where(eq(episodes.titleId, titleId))
		.orderBy(asc(episodes.number))
		.all();
	db.update(titles)
		.set({
			poster: list[0]?.still ?? null,
			startDate: list[0]?.airDate && list[0].airDate > '1901' ? list[0].airDate : null,
			refreshedAt: new Date()
		})
		.where(eq(titles.id, titleId))
		.run();
}

/** Creates a series by hand, starting with one book. */
export async function createCollection(
	userId: number,
	prefs: UserPrefs,
	{ name, work, number }: { name: string; work: string; number: number }
): Promise<TitleRow> {
	const db = getDb();
	const next =
		(db
			.select({ max: sql<number>`max(cast(${titles.externalId} as integer))` })
			.from(titles)
			.where(eq(titles.kind, 'collection'))
			.get()?.max ?? 0) + 1;
	db.insert(titles)
		.values({
			provider: 'local',
			kind: 'collection',
			externalId: String(next),
			mediaType: 'bookseries',
			name: name.trim(),
			status: 'ended',
			refreshedAt: new Date(),
			externalIds: { createdBy: String(userId) }
		})
		.run();
	const collection = db
		.select()
		.from(titles)
		.where(and(eq(titles.kind, 'collection'), eq(titles.externalId, String(next))))
		.get()!;
	await addBookToCollection(userId, prefs, collection, work, number);
	return collection;
}

/** Adds a book to a hand-made series and moves your tracking of that book into it. */
export async function addBookToCollection(
	userId: number,
	prefs: UserPrefs,
	collection: TitleRow,
	work: string,
	number: number
): Promise<void> {
	await addBook(collection, work, number, readLocale(prefs));
	const book = getDb()
		.select()
		.from(titles)
		.where(and(eq(titles.kind, 'book'), eq(titles.externalId, work)))
		.get();
	const unit = unitForWork(collection.id, work);
	if (book && unit) absorbBook(userId, book, collection, unit, prefs);
}

/** Takes a book out of a hand-made series; its reads go back to the book itself. */
export async function removeBookFromCollection(collection: TitleRow, work: string): Promise<void> {
	const db = getDb();
	const unit = unitForWork(collection.id, work);
	if (!unit) return;
	const book = await ensureTitle('book', work);
	db.transaction(() => {
		db.update(activityEvents)
			.set({ titleId: book.id, unitId: null })
			.where(eq(activityEvents.unitId, unit.id))
			.run();
		db.delete(episodes).where(eq(episodes.id, unit.id)).run();
	});
	refreshCollection(collection.id);
}

export function renameCollection(collection: TitleRow, name: string): void {
	getDb().update(titles).set({ name: name.trim() }).where(eq(titles.id, collection.id)).run();
}

/** All hand-made series (shared by the household), for "add to a series". */
export function listCollections(): { id: string; name: string; books: number }[] {
	return getDb()
		.select({
			id: titles.externalId,
			name: titles.name,
			// Spelled out: inside the subquery an unqualified id would mean the episode's.
			books: sql<number>`(select count(*) from episodes e where e.title_id = titles.id)`
		})
		.from(titles)
		.where(eq(titles.kind, 'collection'))
		.orderBy(sql`${titles.name} collate nocase`)
		.all();
}

/**
 * Restores a hand-made series from an export: reuses one with the same name, or creates it with
 * the exported books (fetching their covers and page counts when possible).
 */
export async function restoreCollection(
	name: string,
	volumes: { number: number; name: string | null; work: string | null }[]
): Promise<TitleRow> {
	const db = getDb();
	const same = db
		.select()
		.from(titles)
		.where(and(eq(titles.kind, 'collection'), eq(titles.name, name)))
		.get();
	if (same) return same;
	const next =
		(db
			.select({ max: sql<number>`max(cast(${titles.externalId} as integer))` })
			.from(titles)
			.where(eq(titles.kind, 'collection'))
			.get()?.max ?? 0) + 1;
	const collection = db
		.insert(titles)
		.values({
			provider: 'local',
			kind: 'collection',
			externalId: String(next),
			mediaType: 'bookseries',
			name,
			status: 'ended',
			refreshedAt: new Date()
		})
		.returning()
		.get();
	for (const volume of volumes) {
		if (!volume.work || collectionOfWork(volume.work)) continue;
		try {
			await addBook(collection, volume.work, volume.number);
		} catch {
			db.insert(episodes)
				.values({
					titleId: collection.id,
					seasonNumber: 1,
					number: volume.number,
					name: volume.name,
					airDate: '1900-01-01',
					externalId: volume.work
				})
				.onConflictDoNothing()
				.run();
		}
	}
	refreshCollection(collection.id);
	return collection;
}
