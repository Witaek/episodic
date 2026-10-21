import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';
import { readingStats } from '$lib/server/services/reading-stats';
import type { StatsRange } from '$lib/server/services/stats';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const user = locals.user!;
	const range: StatsRange = url.searchParams.get('range') === 'all' ? 'all' : 'year';
	return { year: new Date().getFullYear(), stats: readingStats(user.id, user.prefs, range) };
};

export const actions: Actions = {
	/** Sets (or clears, with 0) this year's reading goal. */
	goal: async ({ locals, request }) => {
		const user = locals.user!;
		const books = Number((await request.formData()).get('books'));
		if (!Number.isInteger(books) || books < 0 || books > 1000) {
			return fail(400, { message: 'Choose a number between 0 and 1000' });
		}
		const year = new Date().getFullYear();
		const prefs = { ...user.prefs, readingGoal: books ? { year, books } : undefined };
		getDb().update(users).set({ prefs }).where(eq(users.id, user.id)).run();
		return { saved: true };
	}
};
