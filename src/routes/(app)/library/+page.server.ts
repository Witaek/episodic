import { LIBRARY_STATUSES, type LibraryStatus } from '$lib/media-types/types';
import { showsForAnimeMovies } from '$lib/server/services/franchise';
import { listLibrary, type LibrarySort } from '$lib/server/services/library';
import type { LibraryItem } from '$lib/tracking/types';
import type { PageServerLoad } from './$types';

const TYPES = ['all', 'tv', 'anime', 'movie', 'book'] as const;
const SORTS: LibrarySort[] = ['activity', 'added', 'name'];

export const load: PageServerLoad = ({ locals, url }) => {
	const user = locals.user!;
	const statusParam = url.searchParams.get('status') as LibraryStatus | null;
	const status: LibraryStatus =
		statusParam && LIBRARY_STATUSES.includes(statusParam) ? statusParam : 'in_progress';
	const typeParam = url.searchParams.get('type') as (typeof TYPES)[number] | null;
	const type = typeParam && TYPES.includes(typeParam) ? typeParam : 'all';
	const sortParam = url.searchParams.get('sort') as LibrarySort | null;
	const sort = sortParam && SORTS.includes(sortParam) ? sortParam : 'activity';

	// Everything of this type, so the status tabs can show counts for the same filter.
	const ofType = listLibrary(user.id, user.prefs, { sort }).filter((item) => {
		if (type === 'movie') return item.mediaType === 'movie';
		if (type === 'book') return item.mediaType === 'book';
		if (type === 'anime') return item.isAnime;
		if (type === 'tv') return item.mediaType === 'show';
		// "All" means everything you watch; books have their own tab.
		return item.mediaType !== 'book';
	});

	const visible = type === 'all' || type === 'anime' ? foldMovies(ofType) : ofType;
	const counts = Object.fromEntries(LIBRARY_STATUSES.map((s) => [s, 0])) as Record<
		LibraryStatus,
		number
	>;
	for (const item of visible) counts[item.status]++;
	const items = visible.filter((item) => item.status === status);

	return { status, type, sort, items, counts };
};

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
