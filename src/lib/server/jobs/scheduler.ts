import { Cron } from 'croner';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { jobRuns } from '../db/schema';

/**
 * In-process job scheduler. Features register their jobs in `jobs/index.ts`; each run is
 * recorded in `job_runs` so the settings page can show what happened and when.
 */
export interface JobDefinition {
	name: string;
	/** Cron pattern, evaluated in the container's TZ. */
	schedule: string;
	run: () => Promise<string | void>;
	/** Run once shortly after startup. */
	runOnStart?: boolean;
}

const jobs = new Map<string, { definition: JobDefinition; cron: Cron }>();
const running = new Set<string>();

export async function runJob(definition: JobDefinition): Promise<void> {
	if (running.has(definition.name)) return;
	running.add(definition.name);
	const db = getDb();
	const { id } = db
		.insert(jobRuns)
		.values({ job: definition.name, status: 'running', startedAt: new Date() })
		.returning({ id: jobRuns.id })
		.get();
	try {
		const message = await definition.run();
		db.update(jobRuns)
			.set({ status: 'success', message: message ?? null, finishedAt: new Date() })
			.where(eq(jobRuns.id, id))
			.run();
		if (message) console.info(`[jobs] ${definition.name}: ${message}`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		db.update(jobRuns)
			.set({ status: 'error', message, finishedAt: new Date() })
			.where(eq(jobRuns.id, id))
			.run();
		console.error(`[jobs] ${definition.name} failed: ${message}`);
	} finally {
		running.delete(definition.name);
	}
}

export function registerJobs(definitions: JobDefinition[]): void {
	for (const definition of definitions) {
		if (jobs.has(definition.name)) continue;
		const cron = new Cron(definition.schedule, { protect: true }, () => runJob(definition));
		jobs.set(definition.name, { definition, cron });
		if (definition.runOnStart) setTimeout(() => void runJob(definition), 2_000);
	}
}

export function stopJobs(): void {
	for (const { cron } of jobs.values()) cron.stop();
	jobs.clear();
}

export function jobStatus() {
	const db = getDb();
	return [...jobs.values()].map(({ definition, cron }) => ({
		name: definition.name,
		nextRun: cron.nextRun(),
		lastRun:
			db
				.select()
				.from(jobRuns)
				.where(eq(jobRuns.job, definition.name))
				.orderBy(desc(jobRuns.startedAt))
				.get() ?? null
	}));
}
