import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { READ_MEDIA_TYPES, titleHref } from '$lib/catalog/types';
import type { Section } from '$lib/section';
import type { LibraryStatus } from '$lib/media-types/types';
import {
	EMPTY_STATE,
	MOVIE_KEY,
	episodeKey,
	type LibraryItem,
	type ReadingProgress,
	type TitleUserState
} from '$lib/tracking/types';
import type { UserPrefs } from '../db/schema';
import { getDb } from '../db/client';
import { activityEvents, episodes, libraryEntries, titles } from '../db/schema';
import { computeProgress, progressForTitles, watchCounts } from './progress';
import { editionFor, editionsFor, type StoredEdition } from './books';
import { titleEpisodes, type TitleRow } from './titles';

export type LibraryEntry = typeof libraryEntries.$inferSelect;

/** Movies and books are tracked as a whole (no episodes). */
export function isWholeTitle(title: Pick<TitleRow, 'mediaType'>): boolean {
	return title.mediaType === 'movie' || title.mediaType === 'book';
}

/** Series: the page reached in the book being read, and that book's page count. */
export function seriesReading(
	entry: LibraryEntry | undefined,
	list: { seasonNumber: number; number: number; pages: number | null }[]
): ReadingProgress | null {
	const unit = entry?.progress?.unit as { season: number; number: number } | undefined;
	const page = entry?.progress?.page;
	if (!unit || typeof page !== 'number') return null;
	const book = list.find((e) => e.seasonNumber === unit.season && e.number === unit.number);
	return { page, pages: book?.pages ?? null, unit };
}

export function readingOf(
	entry: LibraryEntry | undefined,
	title: Pick<TitleRow, 'pages'>,
	edition: StoredEdition | null = null
): ReadingProgress {
	const page = entry?.progress?.page;
	// The reader's edition may have a different page count than the work.
	const pages = edition?.pages ?? title.pages ?? null;
	return { page: typeof page === 'number' ? page : null, pages };
}

export function getEntry(userId: number, titleId: number): LibraryEntry | undefined {
	return getDb()
		.select()
		.from(libraryEntries)
		.where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.titleId, titleId)))
		.get();
}

export function setStatus(userId: number, titleId: number, status: LibraryStatus): void {
	const now = new Date();
	getDb()
		.insert(libraryEntries)
		.values({ userId, titleId, status, addedAt: now, updatedAt: now })
		.onConflictDoUpdate({
			target: [libraryEntries.userId, libraryEntries.titleId],
			set: { status, updatedAt: now }
		})
		.run();
}

/** Removes the title from the library. Watch history is kept. */
export function removeEntry(userId: number, titleId: number): void {
	getDb()
		.delete(libraryEntries)
		.where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.titleId, titleId)))
		.run();
}

export function touchEntry(userId: number, titleId: number, at = new Date()): void {
	getDb()
		.update(libraryEntries)
		.set({ lastActivityAt: at, updatedAt: new Date() })
		.where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.titleId, titleId)))
		.run();
}

/** Everything the title page needs about one user and one title. */
export function getUserTitleState(
	userId: number,
	title: TitleRow | undefined,
	prefs: UserPrefs
): TitleUserState {
	if (!title) return EMPTY_STATE;
	const entry = getEntry(userId, title.id);
	const watched: Record<string, number> = {};

	if (isWholeTitle(title)) {
		const plays =
			getDb()
				.select({ n: sql<number>`count(*)` })
				.from(activityEvents)
				.where(and(eq(activityEvents.userId, userId), eq(activityEvents.titleId, title.id)))
				.get()?.n ?? 0;
		if (plays) watched[MOVIE_KEY] = plays;
		return {
			titleId: title.id,
			status: entry?.status ?? null,
			watched,
			progress: null,
			reading:
				title.mediaType === 'book'
					? readingOf(entry, title, editionFor(userId, title.externalId))
					: null,
			lastActivityAt: entry?.lastActivityAt?.toISOString() ?? null
		};
	}

	const list = titleEpisodes(title.id);
	const counts = watchCounts(userId, [title.id]);
	for (const episode of list) {
		const plays = counts.get(episode.id);
		if (plays) watched[episodeKey(episode.seasonNumber, episode.number)] = plays;
	}
	return {
		titleId: title.id,
		status: entry?.status ?? null,
		watched,
		progress: computeProgress(list, new Set(counts.keys()), {
			includeSpecials: prefs.includeSpecials
		}),
		reading: title.mediaType === 'bookseries' ? seriesReading(entry, list) : null,
		lastActivityAt: entry?.lastActivityAt?.toISOString() ?? null
	};
}

export type LibrarySort = 'activity' | 'added' | 'name';

/** The user's library with progress, optionally filtered by status. */
export function listLibrary(
	userId: number,
	prefs: UserPrefs,
	{
		statuses,
		sort = 'activity',
		section
	}: { statuses?: LibraryStatus[]; sort?: LibrarySort; section?: Section } = {}
): LibraryItem[] {
	const db = getDb();
	const conditions = [eq(libraryEntries.userId, userId)];
	if (statuses?.length) conditions.push(inArray(libraryEntries.status, statuses));
	// Watch and Read keep separate libraries.
	if (section === 'read') conditions.push(inArray(titles.mediaType, [...READ_MEDIA_TYPES]));
	if (section === 'watch') conditions.push(notInArray(titles.mediaType, [...READ_MEDIA_TYPES]));

	const order =
		sort === 'name'
			? [sql`${titles.name} collate nocase`]
			: sort === 'added'
				? [desc(libraryEntries.addedAt)]
				: [
						desc(sql`coalesce(${libraryEntries.lastActivityAt}, ${libraryEntries.addedAt})`),
						desc(libraryEntries.addedAt)
					];

	const rows = db
		.select({ entry: libraryEntries, title: titles })
		.from(libraryEntries)
		.innerJoin(titles, eq(libraryEntries.titleId, titles.id))
		.where(and(...conditions))
		.orderBy(...order)
		.all();

	const showIds = rows.filter((r) => !isWholeTitle(r.title)).map((r) => r.title.id);
	const progress = progressForTitles(userId, showIds, { includeSpecials: prefs.includeSpecials });

	// Books show the reader's edition (e.g. the French title and cover).
	const editions = editionsFor(
		userId,
		rows.filter((r) => r.title.kind === 'book').map((r) => r.title.externalId)
	);
	return rows.map(({ entry, title }) => {
		const edition = title.kind === 'book' ? (editions.get(title.externalId) ?? null) : null;
		return {
			titleId: title.id,
			kind: title.kind,
			externalId: title.externalId,
			href: titleHref({ kind: title.kind, id: title.externalId }),
			name: edition?.title || title.name,
			mediaType: title.mediaType,
			isAnime: title.isAnime,
			poster: edition?.cover ?? title.poster ?? null,
			backdrop: title.backdrop ?? null,
			logo: title.logo ?? null,
			year: title.startDate ? Number(title.startDate.slice(0, 4)) : null,
			status: entry.status,
			addedAt: entry.addedAt.toISOString(),
			lastActivityAt: entry.lastActivityAt?.toISOString() ?? null,
			progress: progress.get(title.id) ?? null,
			reading:
				title.mediaType === 'book'
					? readingOf(entry, title, edition)
					: title.mediaType === 'bookseries'
						? seriesReading(entry, unitPages(title.id, entry))
						: null
		};
	});
}

/** The page count of the book a series entry is being read in, for its progress bar. */
function unitPages(titleId: number, entry: LibraryEntry) {
	const unit = entry.progress?.unit as { season: number; number: number } | undefined;
	if (!unit) return [];
	return getDb()
		.select({ seasonNumber: episodes.seasonNumber, number: episodes.number, pages: episodes.pages })
		.from(episodes)
		.where(
			and(
				eq(episodes.titleId, titleId),
				eq(episodes.seasonNumber, unit.season),
				eq(episodes.number, unit.number)
			)
		)
		.all();
}

/** Shows you're watching that have an aired episode waiting, most recently active first. */
export function upNext(
	userId: number,
	prefs: UserPrefs,
	section: Section = 'watch'
): LibraryItem[] {
	return listLibrary(userId, prefs, { statuses: ['in_progress'], section }).filter(
		(item) => item.progress?.nextUp
	);
}

export function libraryCounts(userId: number): Record<LibraryStatus, number> {
	const rows = getDb()
		.select({ status: libraryEntries.status, n: sql<number>`count(*)` })
		.from(libraryEntries)
		.where(eq(libraryEntries.userId, userId))
		.groupBy(libraryEntries.status)
		.all();
	const counts = { planned: 0, in_progress: 0, completed: 0, on_hold: 0, dropped: 0 };
	for (const row of rows) counts[row.status] = row.n;
	return counts;
}
