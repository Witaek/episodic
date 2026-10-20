import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { LIBRARY_STATUSES } from '$lib/media-types/types';
import { getDb } from '../db/client';
import { activityEvents, episodes, importJobs, libraryEntries, titles, users } from '../db/schema';
import { ensureTitle } from './titles';

/**
 * Per-user export and restore. Titles are referenced by provider id (not local ids) and episodes
 * by season + number, so an export can be restored into any Episodic instance.
 */

const titleRef = z.object({
	provider: z.enum(['tmdb', 'anilist']),
	kind: z.enum(['movie', 'tv', 'anime']),
	externalId: z.string().regex(/^\d+$/),
	name: z.string()
});

export const exportSchema = z.object({
	format: z.literal('episodic-export'),
	version: z.literal(1),
	exportedAt: z.string(),
	user: z.object({
		username: z.string(),
		displayName: z.string(),
		prefs: z.record(z.string(), z.unknown())
	}),
	library: z.array(
		z.object({
			title: titleRef,
			status: z.enum(LIBRARY_STATUSES),
			rating: z.number().int().nullable(),
			favorite: z.boolean(),
			notes: z.string().nullable(),
			addedAt: z.string(),
			updatedAt: z.string(),
			lastActivityAt: z.string().nullable()
		})
	),
	activity: z.array(
		z.object({
			title: titleRef,
			episode: z.object({ season: z.number().int(), number: z.number().int() }).nullable(),
			action: z.enum(['watched', 'read']),
			occurredAt: z.string(),
			source: z.string(),
			isRepeat: z.boolean()
		})
	)
});

export type EpisodicExport = z.infer<typeof exportSchema>;

export function exportUserData(userId: number): EpisodicExport {
	const db = getDb();
	const user = db.select().from(users).where(eq(users.id, userId)).get()!;
	const ref = (t: typeof titles.$inferSelect) => ({
		provider: t.provider as 'tmdb' | 'anilist',
		kind: t.kind,
		externalId: t.externalId,
		name: t.name
	});

	const library = db
		.select({ entry: libraryEntries, title: titles })
		.from(libraryEntries)
		.innerJoin(titles, eq(titles.id, libraryEntries.titleId))
		.where(eq(libraryEntries.userId, userId))
		.all()
		.map(({ entry, title }) => ({
			title: ref(title),
			status: entry.status,
			rating: entry.rating,
			favorite: entry.favorite,
			notes: entry.notes,
			addedAt: entry.addedAt.toISOString(),
			updatedAt: entry.updatedAt.toISOString(),
			lastActivityAt: entry.lastActivityAt?.toISOString() ?? null
		}));

	const activity = db
		.select({ event: activityEvents, title: titles, episode: episodes })
		.from(activityEvents)
		.innerJoin(titles, eq(titles.id, activityEvents.titleId))
		.leftJoin(episodes, eq(episodes.id, activityEvents.unitId))
		.where(eq(activityEvents.userId, userId))
		.orderBy(activityEvents.occurredAt)
		.all()
		.map(({ event, title, episode }) => ({
			title: ref(title),
			episode: episode ? { season: episode.seasonNumber, number: episode.number } : null,
			action: event.action,
			occurredAt: event.occurredAt.toISOString(),
			source: event.source,
			isRepeat: event.isRepeat
		}));

	return {
		format: 'episodic-export',
		version: 1,
		exportedAt: new Date().toISOString(),
		user: { username: user.username, displayName: user.displayName, prefs: { ...user.prefs } },
		library,
		activity
	};
}

export type ImportJob = typeof importJobs.$inferSelect;

/** Queues a restore and starts it in the background. Returns the job id. */
export function startImport(userId: number, data: EpisodicExport): number {
	const keys = new Set([...data.library, ...data.activity].map((i) => key(i.title)));
	const { id } = getDb()
		.insert(importJobs)
		.values({ userId, status: 'queued', totalTitles: keys.size })
		.returning({ id: importJobs.id })
		.get();
	void runImport(id, userId, data);
	return id;
}

export function getImportJob(userId: number, id: number): ImportJob | undefined {
	return getDb()
		.select()
		.from(importJobs)
		.where(and(eq(importJobs.id, id), eq(importJobs.userId, userId)))
		.get();
}

const key = (t: { kind: string; externalId: string }) => `${t.kind}:${t.externalId}`;

/**
 * Merges an export into the user's data: library entries are added or updated, watch events are
 * added unless the same watch (same episode and time) already exists. Titles are fetched from their
 * provider when this instance doesn't have them yet.
 */
export async function runImport(
	jobId: number,
	userId: number,
	data: EpisodicExport
): Promise<void> {
	const db = getDb();
	const update = (values: Partial<ImportJob>) =>
		db.update(importJobs).set(values).where(eq(importJobs.id, jobId)).run();
	update({ status: 'running' });

	const groups = new Map<
		string,
		{
			title: EpisodicExport['library'][number]['title'];
			entry?: EpisodicExport['library'][number];
			events: EpisodicExport['activity'];
		}
	>();
	for (const entry of data.library) {
		groups.set(key(entry.title), { title: entry.title, entry, events: [] });
	}
	for (const event of data.activity) {
		const group = groups.get(key(event.title)) ?? { title: event.title, events: [] };
		group.events.push(event);
		groups.set(key(event.title), group);
	}

	const skipped: string[] = [];
	let done = 0;
	let addedEntries = 0;
	let addedEvents = 0;

	try {
		for (const group of groups.values()) {
			try {
				const title = await ensureTitle(group.title.kind, group.title.externalId);
				const result = importTitle(userId, title.id, group);
				addedEntries += result.entry;
				addedEvents += result.events;
				if (result.missing > 0) {
					skipped.push(`${group.title.name}: ${result.missing} episode(s) no longer listed`);
				}
			} catch (error) {
				skipped.push(
					`${group.title.name}: ${error instanceof Error ? error.message : String(error)}`
				);
			}
			done++;
			update({ doneTitles: done, addedEntries, addedEvents, skipped });
		}
		update({ status: 'done', finishedAt: new Date(), skipped });
	} catch (error) {
		update({ status: 'error', message: String(error), finishedAt: new Date(), skipped });
	}
}

function importTitle(
	userId: number,
	titleId: number,
	group: { entry?: EpisodicExport['library'][number]; events: EpisodicExport['activity'] }
): { entry: number; events: number; missing: number } {
	const db = getDb();
	return db.transaction((tx) => {
		let entryCount = 0;
		if (group.entry) {
			const e = group.entry;
			const values = {
				status: e.status,
				rating: e.rating,
				favorite: e.favorite,
				notes: e.notes,
				updatedAt: new Date(e.updatedAt),
				lastActivityAt: e.lastActivityAt ? new Date(e.lastActivityAt) : null
			};
			tx.insert(libraryEntries)
				.values({ userId, titleId, addedAt: new Date(e.addedAt), ...values })
				.onConflictDoUpdate({
					target: [libraryEntries.userId, libraryEntries.titleId],
					set: values
				})
				.run();
			entryCount = 1;
		}

		const episodeIds = new Map(
			tx
				.select()
				.from(episodes)
				.where(eq(episodes.titleId, titleId))
				.all()
				.map((ep) => [`${ep.seasonNumber}-${ep.number}`, ep.id])
		);
		const existing = new Set(
			tx
				.select()
				.from(activityEvents)
				.where(and(eq(activityEvents.userId, userId), eq(activityEvents.titleId, titleId)))
				.all()
				.map((ev) => `${ev.unitId}|${ev.occurredAt.getTime()}`)
		);

		let events = 0;
		let missing = 0;
		for (const event of group.events) {
			const unitId = event.episode
				? (episodeIds.get(`${event.episode.season}-${event.episode.number}`) ?? undefined)
				: null;
			if (unitId === undefined) {
				missing++;
				continue;
			}
			const occurredAt = new Date(event.occurredAt);
			const dedupe = `${unitId}|${occurredAt.getTime()}`;
			if (existing.has(dedupe)) continue;
			existing.add(dedupe);
			tx.insert(activityEvents)
				.values({
					userId,
					titleId,
					unitId,
					action: event.action,
					occurredAt,
					source: event.source === 'manual' ? 'import' : event.source,
					isRepeat: event.isRepeat
				})
				.run();
			events++;
		}
		return { entry: entryCount, events, missing };
	});
}
