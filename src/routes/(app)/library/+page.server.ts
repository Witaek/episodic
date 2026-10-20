import { LIBRARY_STATUSES, type LibraryStatus } from '$lib/media-types/types';
import { libraryCounts, listLibrary, type LibrarySort } from '$lib/server/services/library';
import type { PageServerLoad } from './$types';

const TYPES = ['all', 'tv', 'anime', 'movie'] as const;
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

	const items = listLibrary(user.id, user.prefs, { statuses: [status], sort }).filter((item) => {
		if (type === 'movie') return item.mediaType === 'movie';
		if (type === 'anime') return item.isAnime;
		if (type === 'tv') return item.mediaType === 'show';
		return true;
	});

	return { status, type, sort, items, counts: libraryCounts(user.id) };
};
