import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { isDatabaseHealthy } from '$lib/server/db/client';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	const database = isDatabaseHealthy();
	return json(
		{
			status: database ? 'ok' : 'error',
			version: __APP_VERSION__,
			database,
			tmdbConfigured: Boolean(config().TMDB_ACCESS_TOKEN)
		},
		{ status: database ? 200 : 503, headers: { 'cache-control': 'no-store' } }
	);
};
