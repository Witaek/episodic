import type { MediaTypeId, SearchFilter } from '$lib/catalog/types';
import { anime } from './anime';
import { book, bookseries } from './book';
import { manga } from './manga';
import { movie } from './movie';
import { show } from './show';
import type { MediaTypeDefinition } from './types';

/**
 * Every media type the app knows about. To add one, create a folder next to
 * `movie/` exporting a MediaTypeDefinition and register it here. See docs/architecture.md.
 */
const definitions: MediaTypeDefinition[] = [show, anime, movie, book, bookseries, manga];

const byId = new Map(definitions.map((definition) => [definition.id, definition]));

export function mediaType(id: MediaTypeId): MediaTypeDefinition {
	const definition = byId.get(id);
	if (!definition) throw new Error(`Unknown media type: ${id}`);
	return definition;
}

export function mediaTypes(): readonly MediaTypeDefinition[] {
	return definitions;
}

/** Search tabs on the Watch side (books and manga have their own search in Read). */
export const SEARCH_FILTERS: { id: SearchFilter; label: string }[] = [
	{ id: 'all', label: 'All' },
	...definitions
		.filter((d) => d.section === 'watch')
		.map((d) => ({ id: d.searchFilter, label: d.pluralLabel }))
];

/** Read search tabs (no "All": books and manga come from different catalogs). */
export const READ_SEARCH_FILTERS: { id: SearchFilter; label: string }[] = [
	{ id: 'book', label: 'Books' },
	{ id: 'manga', label: 'Manga' }
];

export type { MediaTypeDefinition, LibraryStatus, ProgressModel } from './types';
export { LIBRARY_STATUSES } from './types';
