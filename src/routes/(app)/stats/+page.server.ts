import { watchStats, type StatsRange } from '$lib/server/services/stats';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const range: StatsRange = url.searchParams.get('range') === 'all' ? 'all' : 'year';
	return { year: new Date().getFullYear(), stats: watchStats(locals.user!.id, range) };
};
