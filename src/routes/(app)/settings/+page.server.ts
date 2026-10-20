import { isDatabaseHealthy } from '$lib/server/db/client';
import { jobStatus } from '$lib/server/jobs/scheduler';
import { mappingsAge } from '$lib/server/providers/anime-mapping';
import { providers } from '$lib/server/providers';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
	version: __APP_VERSION__,
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
	jobs: jobStatus().map((job) => ({
		name: job.name,
		nextRun: job.nextRun?.toISOString() ?? null,
		lastStatus: job.lastRun?.status ?? null,
		lastMessage: job.lastRun?.message ?? null,
		lastRun: job.lastRun?.startedAt.toISOString() ?? null
	}))
});
