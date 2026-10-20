import { config } from '$lib/server/config';
import { isDatabaseHealthy } from '$lib/server/db/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
	version: __APP_VERSION__,
	database: isDatabaseHealthy(),
	tmdbConfigured: Boolean(config().TMDB_ACCESS_TOKEN)
});
