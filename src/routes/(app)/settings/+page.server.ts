import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import {
	deleteUserSessions,
	hashPassword,
	validatePassword,
	verifyPassword
} from '$lib/server/auth';
import { config } from '$lib/server/config';
import { getDb, isDatabaseHealthy } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';
import { jobStatus } from '$lib/server/jobs/scheduler';
import { mappingsAge } from '$lib/server/providers/anime-mapping';
import { providers } from '$lib/server/providers';
import {
	disableCalendarFeed,
	getCalendarToken,
	resetCalendarToken
} from '$lib/server/services/calendar-feed';
import { refreshOverview } from '$lib/server/services/refresh';
import { THEME_COOKIE, parseTheme } from '$lib/theme';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const isAdmin = locals.user!.role === 'admin';
	return {
		version: __APP_VERSION__,
		user: locals.user!,
		isAdmin,
		calendarToken: getCalendarToken(locals.user!.id),
		appUrl: config().APP_URL ?? null,
		database: isDatabaseHealthy(),
		providers: providers.map((p) => ({
			id: p.id,
			name: p.name,
			url: p.url,
			configured: p.isConfigured()
		})),
		animeMappingsAgeDays: Number.isFinite(mappingsAge())
			? Math.floor(mappingsAge() / 86_400_000)
			: null,
		refreshTiers: isAdmin ? refreshOverview() : null,
		jobs: isAdmin
			? jobStatus().map((job) => ({
					name: job.name,
					nextRun: job.nextRun?.toISOString() ?? null,
					lastStatus: job.lastRun?.status ?? null,
					lastMessage: job.lastRun?.message ?? null,
					lastRun: job.lastRun?.startedAt.toISOString() ?? null
				}))
			: []
	};
};

export const actions: Actions = {
	profile: async ({ locals, request }) => {
		const form = await request.formData();
		const displayName = String(form.get('displayName') ?? '').trim();
		if (!displayName || displayName.length > 60) {
			return fail(400, {
				profile: { success: false, error: 'Enter a name of up to 60 characters.' }
			});
		}
		getDb().update(users).set({ displayName }).where(eq(users.id, locals.user!.id)).run();
		return { profile: { success: true, error: null } };
	},

	preferences: async ({ locals, request }) => {
		const form = await request.formData();
		const prefs = {
			...locals.user!.prefs,
			includeSpecials: form.get('includeSpecials') === 'on',
			autoStatus: form.get('autoStatus') === 'on',
			notifyWatchlist: form.get('notifyWatchlist') === 'on'
		};
		getDb().update(users).set({ prefs }).where(eq(users.id, locals.user!.id)).run();
		return { preferences: { success: true, error: null } };
	},

	password: async ({ locals, request }) => {
		const form = await request.formData();
		const current = String(form.get('current') ?? '');
		const next = String(form.get('password') ?? '');
		const confirm = String(form.get('confirm') ?? '');
		const user = getDb().select().from(users).where(eq(users.id, locals.user!.id)).get()!;

		if (!(await verifyPassword(user.passwordHash, current))) {
			return fail(400, { password: { success: false, error: 'Your current password is wrong.' } });
		}
		const problem =
			validatePassword(next) ?? (next === confirm ? null : "The passwords don't match.");
		if (problem) return fail(400, { password: { success: false, error: problem } });

		getDb()
			.update(users)
			.set({ passwordHash: await hashPassword(next) })
			.where(eq(users.id, user.id))
			.run();
		deleteUserSessions(user.id, locals.sessionToken ?? undefined);
		return { password: { success: true, error: null } };
	},

	theme: async ({ request, cookies }) => {
		const theme = parseTheme(String((await request.formData()).get('theme')));
		cookies.set(THEME_COOKIE, theme, {
			path: '/',
			httpOnly: false,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 365 * 5
		});
		return { theme: { success: true, error: null } };
	},

	calendarReset: ({ locals }) => {
		resetCalendarToken(locals.user!.id);
		return { calendar: { success: true, error: null } };
	},

	calendarDisable: ({ locals }) => {
		disableCalendarFeed(locals.user!.id);
		return { calendar: { success: true, error: null } };
	},

	signOutOthers: ({ locals }) => {
		deleteUserSessions(locals.user!.id, locals.sessionToken ?? undefined);
		return { sessions: { success: true, error: null } };
	}
};
