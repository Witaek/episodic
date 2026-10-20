import { error } from '@sveltejs/kit';
import type { SearchFilter } from '$lib/catalog/types';
import { tmdb } from '$lib/server/providers';
import { search, trendingRows } from '$lib/server/services/catalog';
import type { PageServerLoad } from './$types';

const FILTERS: SearchFilter[] = ['all', 'tv', 'anime', 'movie', 'book'];

export const load: PageServerLoad = async ({ url }) => {
	const query = (url.searchParams.get('q') ?? '').slice(0, 200);
	const typeParam = url.searchParams.get('type') as SearchFilter | null;
	const filter: SearchFilter = typeParam && FILTERS.includes(typeParam) ? typeParam : 'all';

	if (!query.trim()) {
		const rows = await trendingRows();
		const browse =
			filter === 'all'
				? rows.flatMap((row) => row.results.slice(0, 8))
				: (rows.find((row) => row.id === filter)?.results ?? []);
		return { query, filter, results: [], browse, tmdbMissing: !tmdb.isConfigured() };
	}

	try {
		const { results, tmdbMissing } = await search(query, filter);
		return { query, filter, results, browse: [], tmdbMissing };
	} catch (cause) {
		console.error('[search] failed', cause);
		error(502, 'Search is unavailable right now. Please try again in a moment.');
	}
};
