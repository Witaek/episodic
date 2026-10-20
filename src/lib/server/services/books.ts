import { and, eq } from 'drizzle-orm';
import type { BookEdition, Image } from '$lib/catalog/types';
import { getDb } from '../db/client';
import { libraryEntries } from '../db/schema';
import { getBookEdition } from './catalog';

/**
 * Each reader can pick an edition of a book (the French translation, for example). The choice is
 * kept on their library entry, so their library, history and page count show that edition while
 * the book itself (the Open Library work) stays shared.
 */

export interface StoredEdition {
	id: string;
	title: string;
	cover: Image | null;
	pages: number | null;
	language: string | null;
}

export function editionOf(
	progress: Record<string, unknown> | null | undefined
): StoredEdition | null {
	const edition = progress?.edition as StoredEdition | undefined;
	return edition?.id ? edition : null;
}

/** Saves the edition on the user's entry (if they have one). Unknown editions are ignored. */
export async function rememberEdition(userId: number, titleId: number, editionId: string | null) {
	if (!editionId || !/^\d+$/.test(editionId)) return;
	const db = getDb();
	const entry = db
		.select()
		.from(libraryEntries)
		.where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.titleId, titleId)))
		.get();
	if (!entry || editionOf(entry.progress)?.id === editionId) return;

	let edition: BookEdition;
	try {
		edition = await getBookEdition(editionId);
	} catch {
		return;
	}
	const stored: StoredEdition = {
		id: edition.id,
		title: edition.title,
		cover: edition.cover,
		pages: edition.pages,
		language: edition.language
	};
	db.update(libraryEntries)
		.set({ progress: { ...(entry.progress ?? {}), edition: stored } })
		.where(eq(libraryEntries.id, entry.id))
		.run();
}
