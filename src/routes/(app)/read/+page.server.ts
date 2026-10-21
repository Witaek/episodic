import { listLibrary } from '$lib/server/services/library';
import { readTrending } from '$lib/server/services/read-search';
import { readingStats } from '$lib/server/services/reading-stats';
import { upcoming } from '$lib/server/services/upcoming';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const user = locals.user!;
	const read = { section: 'read' as const };
	const reading = listLibrary(user.id, user.prefs, { statuses: ['in_progress'], ...read });
	const planned = listLibrary(user.id, user.prefs, {
		statuses: ['planned'],
		sort: 'added',
		...read
	}).slice(0, 20);
	const finished = listLibrary(user.id, user.prefs, { statuses: ['completed'], ...read }).slice(
		0,
		12
	);
	// Books of your series announced for the coming year.
	const comingSoon = upcoming(user.id, { days: 365, ...read }).items.filter((i) => !i.watched);
	return {
		displayName: user.displayName,
		reading,
		planned,
		finished,
		comingSoon,
		goal: readingStats(user.id, user.prefs, 'year').goal,
		// Streamed so your own rows show up immediately.
		trending: Promise.all([readTrending('book'), readTrending('manga')]).then(([books, manga]) => ({
			books,
			manga
		}))
	};
};
