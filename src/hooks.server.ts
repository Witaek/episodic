import { json, redirect, type Handle, type ServerInit } from '@sveltejs/kit';
import {
	SESSION_COOKIE,
	clearSessionCookie,
	isSecureRequest,
	seedAdminFromEnv,
	setSessionCookie,
	userCount,
	validateSession
} from '$lib/server/auth';
import { config } from '$lib/server/config';
import { closeDb, runMigrations } from '$lib/server/db/client';
import { startJobs } from '$lib/server/jobs';
import { stopJobs } from '$lib/server/jobs/scheduler';
import { compress } from '$lib/server/compression';
import { isRequestOriginAllowed } from '$lib/server/security';
import { THEME_COLORS, THEME_COOKIE, parseTheme } from '$lib/theme';

export const init: ServerInit = async () => {
	const { databasePath, APP_URL, TMDB_ACCESS_TOKEN, ADMIN_USERNAME, ADMIN_PASSWORD, DISABLE_JOBS } =
		config();
	runMigrations();
	console.info(`[episodic] v${__APP_VERSION__} database ready at ${databasePath}`);
	if (await seedAdminFromEnv(ADMIN_USERNAME, ADMIN_PASSWORD)) {
		console.info(`[episodic] created admin account "${ADMIN_USERNAME}" from environment`);
	}
	if (!TMDB_ACCESS_TOKEN) {
		console.warn('[episodic] TMDB_ACCESS_TOKEN is not set: TV and movie search are disabled.');
	}
	if (APP_URL) console.info(`[episodic] public URL: ${APP_URL}`);

	if (DISABLE_JOBS) console.warn('[episodic] background jobs are disabled (DISABLE_JOBS)');
	else startJobs();

	// adapter-node emits this after it stops accepting requests (SIGTERM/SIGINT).
	process.once('sveltekit:shutdown', () => {
		stopJobs();
		closeDb();
	});
};

/** Reachable without signing in. */
// /calendar/<token>.ics is authenticated by its secret token.
const PUBLIC_PATHS = ['/login', '/setup', '/api/health', '/calendar'];

// Once an account exists it never goes back to zero (the last admin can't be deleted),
// so the first-run check only hits the database until setup is done.
let setupDone = false;

export const handle: Handle = async ({ event, resolve }) => {
	const { APP_URL, ALLOWED_ORIGINS } = config();
	const allowed = APP_URL ? [APP_URL, ...ALLOWED_ORIGINS] : ALLOWED_ORIGINS;
	if (!isRequestOriginAllowed(event.request, allowed)) {
		return new Response('Cross-site request blocked. Add this URL to ALLOWED_ORIGINS.', {
			status: 403
		});
	}

	event.locals.user = null;
	event.locals.sessionToken = null;
	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		const session = validateSession(token);
		if (session) {
			event.locals.user = session.user;
			event.locals.sessionToken = token;
			setSessionCookie(event.cookies, token, session.expiresAt, isSecureRequest(event.request));
		} else {
			clearSessionCookie(event.cookies, isSecureRequest(event.request));
		}
	}

	const path = event.url.pathname;
	const isApi = path.startsWith('/api/');
	const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

	if (!setupDone) setupDone = userCount() > 0;
	if (!setupDone && !isPublic) {
		if (isApi) return json({ error: 'Setup required' }, { status: 503 });
		redirect(303, '/setup');
	}

	if (!event.locals.user && !isPublic) {
		if (isApi) return json({ error: 'Not signed in' }, { status: 401 });
		const target = path + event.url.search;
		redirect(303, target === '/' ? '/login' : `/login?redirectTo=${encodeURIComponent(target)}`);
	}

	const theme = parseTheme(event.cookies.get(THEME_COOKIE));
	const response = await resolve(event, {
		transformPageChunk: ({ html }) =>
			html
				.replace('%episodic.theme%', theme)
				.replace('%episodic.themeColor%', THEME_COLORS[theme === 'light' ? 'light' : 'dark'])
	});
	return compress(event.request, response);
};
