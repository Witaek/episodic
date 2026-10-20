import type { MediaTypeId, SearchFilter } from '$lib/catalog/types';
import { anime } from './anime';
import { book } from './book';
import { movie } from './movie';
import { show } from './show';
import type { MediaTypeDefinition } from './types';

/**
 * Every media type the app knows about. To add one, create a folder next to
 * `movie/` exporting a MediaTypeDefinition and register it here. See docs/architecture.md.
 */
const definitions: MediaTypeDefinition[] = [show, anime, movie, book];

const byId = new Map(definitions.map((definition) => [definition.id, definition]));

export function mediaType(id: MediaTypeId): MediaTypeDefinition {
	const definition = byId.get(id);
	if (!definition) throw new Error(`Unknown media type: ${id}`);
	return definition;
}

export function mediaTypes(): readonly MediaTypeDefinition[] {
	return definitions;
}

export const SEARCH_FILTERS: { id: SearchFilter; label: string }[] = [
	{ id: 'all', label: 'All' },
	...definitions.map((d) => ({ id: d.searchFilter, label: d.pluralLabel }))
];

export type { MediaTypeDefinition, LibraryStatus, ProgressModel } from './types';
export { LIBRARY_STATUSES } from './types';
