import type { Handle, ServerInit } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { closeDb, runMigrations } from '$lib/server/db/client';
import { isRequestOriginAllowed } from '$lib/server/security';

export const init: ServerInit = async () => {
	const { databasePath, APP_URL, TMDB_ACCESS_TOKEN } = config();
	runMigrations();
	console.info(`[episodic] v${__APP_VERSION__} database ready at ${databasePath}`);
	if (!TMDB_ACCESS_TOKEN) {
		console.warn('[episodic] TMDB_ACCESS_TOKEN is not set: search and metadata are disabled.');
	}
	if (APP_URL) console.info(`[episodic] public URL: ${APP_URL}`);

	process.once('SIGTERM', closeDb);
	process.once('SIGINT', closeDb);
};

export const handle: Handle = async ({ event, resolve }) => {
	const { APP_URL, ALLOWED_ORIGINS } = config();
	const allowed = APP_URL ? [APP_URL, ...ALLOWED_ORIGINS] : ALLOWED_ORIGINS;

	if (!isRequestOriginAllowed(event.request, allowed)) {
		return new Response('Cross-site request blocked. Add this URL to ALLOWED_ORIGINS.', {
			status: 403
		});
	}

	return resolve(event);
};
