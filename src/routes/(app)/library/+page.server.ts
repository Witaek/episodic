import { LIBRARY_STATUSES, type LibraryStatus } from '$lib/media-types/types';
import { listLibrary, type LibrarySort } from '$lib/server/services/library';
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

	const counts = Object.fromEntries(LIBRARY_STATUSES.map((s) => [s, 0])) as Record<
		LibraryStatus,
		number
	>;
	for (const item of ofType) counts[item.status]++;
	const items = ofType.filter((item) => item.status === status);

	return { status, type, sort, items, counts };
};
