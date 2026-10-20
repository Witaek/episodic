import { localDateString } from '$lib/server/services/progress';
import { scheduleBetween, upcoming } from '$lib/server/services/upcoming';
import type { PageServerLoad } from './$types';

/** Monday-first weeks covering the whole month. */
function monthGrid(year: number, month: number) {
	const first = new Date(year, month, 1);
	const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
	const last = new Date(year, month + 1, 0);
	const end = new Date(year, month + 1, (7 - ((last.getDay() + 6) % 7) - 1) % 7);
	return { from: localDateString(start), to: localDateString(end) };
}

export const load: PageServerLoad = ({ locals, url }) => {
	const userId = locals.user!.id;
	if (url.searchParams.get('view') !== 'calendar') {
		return { view: 'list' as const, ...upcoming(userId, { days: 30 }) };
	}

	const now = new Date();
	const param = url.searchParams.get('month');
	const match = param?.match(/^(\d{4})-(\d{2})$/);
	const year = match ? Number(match[1]) : now.getFullYear();
	const month = match ? Math.min(Math.max(Number(match[2]) - 1, 0), 11) : now.getMonth();
	const { from, to } = monthGrid(year, month);

	return {
		view: 'calendar' as const,
		year,
		month,
		from,
		to,
		today: localDateString(now),
		items: scheduleBetween(userId, from, to),
		announced: []
	};
};
