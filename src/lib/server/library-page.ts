import type { ServerLoadEvent } from '@sveltejs/kit';
import { LIBRARY_STATUSES, type LibraryStatus } from '$lib/media-types/types';
import type { Section } from '$lib/section';
import type { LibraryItem } from '$lib/tracking/types';
import { showsForAnimeMovies } from './services/franchise';
import { listLibrary, type LibrarySort } from './services/library';

/** Type filters for each side's library. "All" is everything on that side. */
export const LIBRARY_TYPES = {
	watch: ['all', 'tv', 'anime', 'movie'],
	read: ['all', 'book', 'manga']
} as const satisfies Record<Section, readonly string[]>;

const SORTS: LibrarySort[] = ['activity', 'added', 'name'];

function matchesType(item: LibraryItem, type: string): boolean {
	switch (type) {
		case 'movie':
			return item.mediaType === 'movie';
		case 'anime':
			return item.isAnime;
		case 'tv':
			return item.mediaType === 'show';
		case 'book':
			return item.mediaType === 'book' || item.mediaType === 'bookseries';
		case 'manga':
			return item.mediaType === 'manga';
		default:
			return true;
	}
}

/** The Library (Watch) and Shelf (Read) pages: one side's titles by status, type and sort. */
export function loadLibraryPage({ locals, url }: ServerLoadEvent, section: Section) {
	const user = locals.user!;
	const statusParam = url.searchParams.get('status') as LibraryStatus | null;
	const status: LibraryStatus =
		statusParam && LIBRARY_STATUSES.includes(statusParam) ? statusParam : 'in_progress';
	const types: readonly string[] = LIBRARY_TYPES[section];
	const typeParam = url.searchParams.get('type');
	const type = typeParam && types.includes(typeParam) ? typeParam : 'all';
	const sortParam = url.searchParams.get('sort') as LibrarySort | null;
	const sort = sortParam && SORTS.includes(sortParam) ? sortParam : 'activity';

	// Everything of this type, so the status tabs can show counts for the same filter.
	const ofType = listLibrary(user.id, user.prefs, { sort, section }).filter((item) =>
		matchesType(item, type)
	);

	const visible =
		section === 'watch' && (type === 'all' || type === 'anime') ? foldMovies(ofType) : ofType;
	const counts = Object.fromEntries(LIBRARY_STATUSES.map((s) => [s, 0])) as Record<
		LibraryStatus,
		number
	>;
	for (const item of visible) counts[item.status]++;
	const items = visible.filter((item) => item.status === status);

	return { section, status, type, sort, items, counts };
}

/** Anime movies whose show is in the library are shown on the show's card instead. */
function foldMovies(items: LibraryItem[]): LibraryItem[] {
	const movies = items.filter((i) => i.isAnime && i.kind === 'movie');
	if (movies.length === 0) return items;
	const showOf = showsForAnimeMovies(movies.map((m) => Number(m.externalId)));
	const shows = new Map(items.filter((i) => i.kind === 'tv').map((i) => [Number(i.externalId), i]));
	const bundled = new Map<LibraryItem, number>();
	const kept = items.filter((item) => {
		if (!(item.isAnime && item.kind === 'movie')) return true;
		const show = shows.get(showOf.get(Number(item.externalId)) ?? -1);
		if (!show) return true;
		bundled.set(show, (bundled.get(show) ?? 0) + 1);
		return false;
	});
	return kept.map((item) =>
		bundled.has(item) ? { ...item, bundledMovies: bundled.get(item) } : item
	);
}
