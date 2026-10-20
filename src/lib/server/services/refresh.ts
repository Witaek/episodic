import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { getDb } from '../db/client';
import { activityEvents, episodes, libraryEntries, titles, users } from '../db/schema';
import { enrichAirTimes } from './airing';
import { isAired, localDateString } from './progress';
import { syncTitle, type TitleRow } from './titles';
import { applyAutoStatus } from './tracking';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export type RefreshTier = 'hot' | 'active' | 'settled';

/** How often each tier is refreshed. */
export const TIER_INTERVAL: Record<RefreshTier, number> = {
	hot: 6 * HOUR,
	active: DAY,
	settled: 30 * DAY
};
const FULL_REFRESH_INTERVAL = 30 * DAY;

/** Titles anyone has in their library or history. */
function trackedTitleIds(): number[] {
	const db = getDb();
	const rows = db
		.selectDistinct({ id: libraryEntries.titleId })
		.from(libraryEntries)
		.union(db.selectDistinct({ id: activityEvents.titleId }).from(activityEvents))
		.all();
	return rows.map((r) => r.id);
}

/** Titles with an episode (or release) close to now: refreshed most often. */
function hotTitleIds(now = new Date()): Set<number> {
	const from = localDateString(new Date(now.getTime() - 3 * DAY));
	const to = localDateString(new Date(now.getTime() + 14 * DAY));
	const db = getDb();
	const fromEpisodes = db
		.selectDistinct({ id: episodes.titleId })
		.from(episodes)
		.where(and(gte(episodes.airDate, from), lte(episodes.airDate, to)))
		.all();
	const fromReleases = db
		.select({ id: titles.id })
		.from(titles)
		.where(
			and(eq(titles.mediaType, 'movie'), gte(titles.startDate, from), lte(titles.startDate, to))
		)
		.all();
	return new Set([...fromEpisodes, ...fromReleases].map((r) => r.id));
}

export function tierOf(title: Pick<TitleRow, 'id' | 'status'>, hot: Set<number>): RefreshTier {
	if (hot.has(title.id)) return 'hot';
	return ['returning', 'in_production', 'planned', 'upcoming', 'unknown'].includes(title.status)
		? 'active'
		: 'settled';
}

/** Tracked titles whose refresh is due, most overdue first. */
export function dueTitles(
	limit: number,
	now = new Date()
): { title: TitleRow; tier: RefreshTier }[] {
	const ids = trackedTitleIds();
	if (ids.length === 0) return [];
	const hot = hotTitleIds(now);
	return getDb()
		.select()
		.from(titles)
		.where(inArray(titles.id, ids))
		.all()
		.map((title) => {
			const tier = tierOf(title, hot);
			const overdue = now.getTime() - title.refreshedAt.getTime() - TIER_INTERVAL[tier];
			return { title, tier, overdue };
		})
		.filter((t) => t.overdue >= 0)
		.sort((a, b) => b.overdue - a.overdue)
		.slice(0, limit)
		.map(({ title, tier }) => ({ title, tier }));
}

/**
 * Re-fetches a title, adds exact air times and applies status rules for episodes that aired since
 * the previous refresh (a Completed show with a new episode goes back to Watching).
 */
export async function refreshTitle(title: TitleRow, now = new Date()): Promise<TitleRow> {
	const full =
		!title.fullRefreshedAt ||
		now.getTime() - title.fullRefreshedAt.getTime() > FULL_REFRESH_INTERVAL;
	const previous = title.refreshedAt;
	const updated = await syncTitle(title.kind, title.externalId, {
		fresh: true,
		seasons: full ? 'all' : 'recent'
	});
	if (
		updated.status !== 'ended' &&
		updated.status !== 'canceled' &&
		updated.status !== 'released'
	) {
		await enrichAirTimes(updated).catch((error) =>
			console.warn(`[refresh] air times for "${updated.name}" failed: ${String(error)}`)
		);
	}
	if (newlyAired(updated.id, previous, now) > 0) reopenCompleted(updated);
	return updated;
}

/** Episodes that were not aired at `since` but are now. */
export function newlyAired(titleId: number, since: Date, now = new Date()): number {
	return getDb()
		.select()
		.from(episodes)
		.where(eq(episodes.titleId, titleId))
		.all()
		.filter((e) => e.seasonNumber !== 0 && isAired(e, now) && !isAired(e, since)).length;
}

function reopenCompleted(title: TitleRow): void {
	const rows = getDb()
		.select({ userId: libraryEntries.userId, prefs: users.prefs })
		.from(libraryEntries)
		.innerJoin(users, eq(users.id, libraryEntries.userId))
		.where(and(eq(libraryEntries.titleId, title.id), eq(libraryEntries.status, 'completed')))
		.all();
	for (const row of rows) applyAutoStatus(row.userId, title, row.prefs, 'refresh');
}

/** One scheduler pass: refreshes up to `limit` due titles. */
export async function refreshDueTitles(limit = 25): Promise<string> {
	const due = dueTitles(limit);
	let ok = 0;
	const failed: string[] = [];
	for (const { title } of due) {
		try {
			await refreshTitle(title);
			ok++;
		} catch (error) {
			failed.push(title.name);
			console.warn(`[refresh] "${title.name}" failed: ${String(error)}`);
			// Push it back so one broken title doesn't block the queue.
			getDb().update(titles).set({ refreshedAt: new Date() }).where(eq(titles.id, title.id)).run();
		}
	}
	if (due.length === 0) return 'nothing due';
	return `refreshed ${ok} of ${due.length} titles${failed.length ? ` (failed: ${failed.join(', ')})` : ''}`;
}

/** Counts for the status panel. */
export function refreshOverview(): Record<RefreshTier, number> {
	const ids = trackedTitleIds();
	const hot = hotTitleIds();
	const counts = { hot: 0, active: 0, settled: 0 };
	if (ids.length === 0) return counts;
	for (const title of getDb()
		.select({ id: titles.id, status: titles.status })
		.from(titles)
		.where(inArray(titles.id, ids))
		.all()) {
		counts[tierOf(title, hot)]++;
	}
	return counts;
}
