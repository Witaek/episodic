import { and, eq, inArray } from 'drizzle-orm';
import { BOOK_LANGUAGES, type BookLanguage, type Image } from '$lib/catalog/types';
import { getDb } from '../db/client';
import { titles, userEditions } from '../db/schema';
import { bookEditions, defaultEdition } from './book-details';
import { getBookEdition } from './catalog';

const isBookLanguage = (value: string): value is BookLanguage =>
	BOOK_LANGUAGES.some((l) => l.id === value);

/**
 * Each reader can pick an edition of a book (the French translation, or the cover they own). The
 * choice is kept per reader and per Open Library work, so their library, history, series pages and
 * page count show that edition while the book itself (the work) stays shared.
 */

export interface StoredEdition {
	id: string;
	title: string;
	cover: Image | null;
	pages: number | null;
	/** "cover:pol" when only the cover was taken from an edition in another language. */
	language: string | null;
}

/** Only the cover was chosen (from an edition in another language than the reader's). */
export const isCoverOnly = (edition: StoredEdition | null) =>
	!!edition?.language?.startsWith('cover:');

const toStored = (row: typeof userEditions.$inferSelect): StoredEdition => ({
	id: row.editionId,
	title: row.title,
	cover: row.cover ?? null,
	pages: row.pages,
	language: row.language
});

/** The edition this reader chose for a work, if any. */
export function editionFor(userId: number, work: string): StoredEdition | null {
	const row = getDb()
		.select()
		.from(userEditions)
		.where(and(eq(userEditions.userId, userId), eq(userEditions.work, work)))
		.get();
	return row ? toStored(row) : null;
}

/** For many works at once (a library page, a series). */
export function editionsFor(userId: number, works: string[]): Map<string, StoredEdition> {
	if (works.length === 0) return new Map();
	const rows = getDb()
		.select()
		.from(userEditions)
		.where(and(eq(userEditions.userId, userId), inArray(userEditions.work, works)))
		.all();
	return new Map(rows.map((row) => [row.work, toStored(row)]));
}

/**
 * Saves the reader's edition of a work. An edition in another language than the reader's only
 * lends its cover: the title and page count stay those of the reader's language. Returns it, or
 * null for an unknown edition.
 */
export async function chooseEdition(
	userId: number,
	work: string,
	editionId: string,
	readerLanguage?: string
): Promise<StoredEdition | null> {
	if (!/^\d+$/.test(editionId)) return null;
	const edition = await getBookEdition(editionId).catch(() => null);
	if (!edition) return null;
	const coverOnly = !!readerLanguage && !!edition.language && edition.language !== readerLanguage;
	// Only the cover: keep the title and pages of the usual edition in the reader's language.
	const usual =
		coverOnly && isBookLanguage(readerLanguage)
			? defaultEdition(await bookEditions(work), readerLanguage)
			: null;
	const values = {
		editionId: edition.id,
		title: coverOnly ? (usual?.title ?? '') : edition.title,
		cover: edition.cover,
		pages: coverOnly ? (usual?.pages ?? null) : edition.pages,
		// A cover-only choice is marked by the reader's language, so the page keeps that edition.
		language: coverOnly ? `cover:${edition.language}` : edition.language,
		updatedAt: new Date()
	};
	getDb()
		.insert(userEditions)
		.values({ userId, work, ...values })
		.onConflictDoUpdate({ target: [userEditions.userId, userEditions.work], set: values })
		.run();
	return editionFor(userId, work);
}

/** Back to the default edition (the one in the reader's language, or the work). */
export function clearEdition(userId: number, work: string): void {
	getDb()
		.delete(userEditions)
		.where(and(eq(userEditions.userId, userId), eq(userEditions.work, work)))
		.run();
}

/** Saves the edition a book was opened in (`?edition=` from search), for a stored book title. */
export async function rememberEdition(
	userId: number,
	titleId: number,
	editionId: string | null,
	readerLanguage?: string
) {
	if (!editionId) return;
	const title = getDb().select().from(titles).where(eq(titles.id, titleId)).get();
	if (title?.kind !== 'book') return;
	await chooseEdition(userId, title.externalId, editionId, readerLanguage);
}
