import { tmdb } from '$lib/server/providers';
import { trendingRows } from '$lib/server/services/catalog';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({
	rows: await trendingRows(),
	tmdbMissing: !tmdb.isConfigured()
});
