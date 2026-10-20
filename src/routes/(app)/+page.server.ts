import { tmdb } from '$lib/server/providers';
import { trendingRows } from '$lib/server/services/catalog';
import { listLibrary, upNext } from '$lib/server/services/library';
import { upcoming } from '$lib/server/services/upcoming';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	const watching = upNext(user.id, user.prefs);
	const watchlist = listLibrary(user.id, user.prefs, {
		statuses: ['planned'],
		sort: 'added'
	}).slice(0, 20);
	return {
		displayName: user.displayName,
		upNext: watching,
		watchlist,
		airingSoon: upcoming(user.id, { days: 7 }).items.filter(
			(item) => !item.airAt || new Date(item.airAt) > new Date()
		),
		// Trending is streamed so the personal rows show up immediately.
		rows: trendingRows(),
		tmdbMissing: !tmdb.isConfigured()
	};
};
