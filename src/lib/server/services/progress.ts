import { and, eq, inArray, sql } from 'drizzle-orm';
import type { EpisodeBrief, ProgressSummary } from '$lib/tracking/types';
import { getDb } from '../db/client';
import { activityEvents, episodes } from '../db/schema';

type EpisodeRow = typeof episodes.$inferSelect;

export interface ProgressOptions {
	includeSpecials?: boolean;
	now?: Date;
}

/** "YYYY-MM-DD" for the server's local date (TZ). */
export function localDateString(now = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isAired(episode: Pick<EpisodeRow, 'airDate' | 'airAt'>, now = new Date()): boolean {
	if (episode.airAt) return new Date(episode.airAt).getTime() <= now.getTime();
	if (episode.airDate) return episode.airDate <= localDateString(now);
	return false;
}

export function compareEpisodes(
	a: Pick<EpisodeRow, 'seasonNumber' | 'number'>,
	b: Pick<EpisodeRow, 'seasonNumber' | 'number'>
): number {
	// Specials (season 0) sort after regular seasons.
	const season = (n: number) => (n === 0 ? Number.MAX_SAFE_INTEGER : n);
	return season(a.seasonNumber) - season(b.seasonNumber) || a.number - b.number;
}

export function toBrief(episode: EpisodeRow): EpisodeBrief {
	return {
		id: episode.id,
		seasonNumber: episode.seasonNumber,
		number: episode.number,
		name: episode.name,
		airDate: episode.airDate,
		airAt: episode.airAt,
		still: episode.still ?? null,
		runtime: episode.runtime
	};
}

/**
 * Progress through a show. "Next up" is the first aired, unwatched episode after the furthest
 * watched one, so skipped episodes earlier on don't hold you back.
 */
export function computeProgress(
	allEpisodes: EpisodeRow[],
	watchedIds: ReadonlySet<number>,
	{ includeSpecials = false, now = new Date() }: ProgressOptions = {}
): ProgressSummary {
	const list = allEpisodes
		.filter((e) => includeSpecials || e.seasonNumber !== 0)
		.sort(compareEpisodes);

	let aired = 0;
	let watched = 0;
	let furthestWatched = -1;
	list.forEach((episode, index) => {
		const isWatched = watchedIds.has(episode.id);
		if (isWatched) furthestWatched = index;
		if (isAired(episode, now)) {
			aired++;
			if (isWatched) watched++;
		}
	});

	const after = list.slice(furthestWatched + 1);
	const nextUp = after.find((e) => !watchedIds.has(e.id) && isAired(e, now)) ?? null;
	const nextToAir = list.find((e) => !isAired(e, now)) ?? null;

	return {
		watched,
		aired,
		total: list.length,
		percent: aired ? Math.round((watched / aired) * 100) : 0,
		upToDate: watched > 0 && nextUp === null,
		nextUp: nextUp ? toBrief(nextUp) : null,
		nextToAir: nextToAir ? toBrief(nextToAir) : null
	};
}

/** Watch counts per episode for one user and some titles. */
export function watchCounts(userId: number, titleIds: number[]): Map<number, number> {
	if (titleIds.length === 0) return new Map();
	const rows = getDb()
		.select({ unitId: activityEvents.unitId, plays: sql<number>`count(*)` })
		.from(activityEvents)
		.where(
			and(
				eq(activityEvents.userId, userId),
				inArray(activityEvents.titleId, titleIds),
				sql`${activityEvents.unitId} is not null`
			)
		)
		.groupBy(activityEvents.unitId)
		.all();
	return new Map(rows.map((r) => [r.unitId!, r.plays]));
}

/** Progress for many shows at once (two queries). */
export function progressForTitles(
	userId: number,
	titleIds: number[],
	options: ProgressOptions = {}
): Map<number, ProgressSummary> {
	if (titleIds.length === 0) return new Map();
	const rows = getDb().select().from(episodes).where(inArray(episodes.titleId, titleIds)).all();
	const counts = watchCounts(userId, titleIds);
	const watched = new Set(counts.keys());

	const byTitle = new Map<number, EpisodeRow[]>();
	for (const row of rows) {
		const list = byTitle.get(row.titleId) ?? [];
		list.push(row);
		byTitle.set(row.titleId, list);
	}
	const result = new Map<number, ProgressSummary>();
	for (const [titleId, list] of byTitle)
		result.set(titleId, computeProgress(list, watched, options));
	return result;
}
