import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { WatchTarget } from '$lib/tracking/types';
import { getDb } from '../db/client';
import { activityEvents, episodes, type UserPrefs } from '../db/schema';
import { getEntry, setStatus, touchEntry } from './library';
import { compareEpisodes, computeProgress, isAired, watchCounts } from './progress';
import { titleEpisodes, type TitleRow } from './titles';

type EpisodeRow = typeof episodes.$inferSelect;

export class TrackingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TrackingError';
	}
}

/** The episodes a target refers to. Bulk targets only include aired episodes. */
export function selectEpisodes(
	all: EpisodeRow[],
	target: WatchTarget,
	{ includeSpecials = false, now = new Date() }: { includeSpecials?: boolean; now?: Date } = {}
): EpisodeRow[] {
	const sorted = [...all].sort(compareEpisodes);
	switch (target.type) {
		case 'episode': {
			const episode = sorted.find(
				(e) => e.seasonNumber === target.season && e.number === target.number
			);
			if (!episode) throw new TrackingError('Episode not found');
			return [episode];
		}
		case 'season':
			return sorted.filter((e) => e.seasonNumber === target.season && isAired(e, now));
		case 'upTo': {
			const limit = { seasonNumber: target.season, number: target.number };
			return sorted.filter(
				(e) =>
					isAired(e, now) &&
					compareEpisodes(e, limit) <= 0 &&
					// Up to a special: only that season's specials. Otherwise: regular seasons.
					(target.season === 0 ? e.seasonNumber === 0 : e.seasonNumber !== 0 || includeSpecials)
			);
		}
		case 'all':
			return sorted.filter((e) => isAired(e, now) && (includeSpecials || e.seasonNumber !== 0));
		case 'movie':
			throw new TrackingError('Not a movie');
	}
}

export interface WatchOptions {
	watchedAt?: Date;
	/** Add a play even when already watched. */
	rewatch?: boolean;
	source?: string;
}

/** Records watches. Returns the new event ids and, for single episodes, earlier gaps. */
export function watch(
	userId: number,
	title: TitleRow,
	target: WatchTarget,
	prefs: UserPrefs,
	{ watchedAt = new Date(), rewatch = false, source = 'manual' }: WatchOptions = {}
): { eventIds: number[]; earlierUnwatched: number } {
	const db = getDb();

	if (title.mediaType === 'movie') {
		if (target.type !== 'movie') throw new TrackingError('Movies are marked as a whole');
		const plays = db
			.select({ n: sql<number>`count(*)` })
			.from(activityEvents)
			.where(and(eq(activityEvents.userId, userId), eq(activityEvents.titleId, title.id)))
			.get()!.n;
		if (plays > 0 && !rewatch) return { eventIds: [], earlierUnwatched: 0 };
		const { id } = db
			.insert(activityEvents)
			.values({
				userId,
				titleId: title.id,
				unitId: null,
				action: 'watched',
				occurredAt: watchedAt,
				source,
				isRepeat: plays > 0
			})
			.returning({ id: activityEvents.id })
			.get();
		applyAutoStatus(userId, title, prefs, 'watch', watchedAt);
		return { eventIds: [id], earlierUnwatched: 0 };
	}

	const all = titleEpisodes(title.id);
	const selected = selectEpisodes(all, target, { includeSpecials: prefs.includeSpecials });
	const counts = watchCounts(userId, [title.id]);
	const toInsert = selected.filter((e) => rewatch || !counts.has(e.id));

	const eventIds = db.transaction((tx) =>
		toInsert.map(
			(episode) =>
				tx
					.insert(activityEvents)
					.values({
						userId,
						titleId: title.id,
						unitId: episode.id,
						action: 'watched',
						occurredAt: watchedAt,
						source,
						isRepeat: counts.has(episode.id)
					})
					.returning({ id: activityEvents.id })
					.get().id
		)
	);

	let earlierUnwatched = 0;
	if (target.type === 'episode' && target.season !== 0) {
		earlierUnwatched = selectEpisodes(
			all,
			{ type: 'upTo', season: target.season, number: target.number },
			{ includeSpecials: prefs.includeSpecials }
		).filter((e) => !counts.has(e.id) && !selected.includes(e)).length;
	}

	if (eventIds.length) applyAutoStatus(userId, title, prefs, 'watch', watchedAt);
	return { eventIds, earlierUnwatched };
}

/** Removes the most recent play of each targeted episode (or of the movie). */
export function unwatch(userId: number, title: TitleRow, target: WatchTarget, prefs: UserPrefs) {
	const db = getDb();
	let unitIds: (number | null)[];
	if (title.mediaType === 'movie') {
		unitIds = [null];
	} else {
		const all = titleEpisodes(title.id);
		// Unwatching a whole season or "up to" also covers unaired episodes marked by hand.
		const now = new Date(8.64e15);
		unitIds = selectEpisodes(all, target, { includeSpecials: prefs.includeSpecials, now }).map(
			(e) => e.id
		);
	}

	db.transaction((tx) => {
		for (const unitId of unitIds) {
			const latest = tx
				.select({ id: activityEvents.id })
				.from(activityEvents)
				.where(
					and(
						eq(activityEvents.userId, userId),
						eq(activityEvents.titleId, title.id),
						unitId === null ? isNull(activityEvents.unitId) : eq(activityEvents.unitId, unitId)
					)
				)
				.orderBy(desc(activityEvents.occurredAt), desc(activityEvents.id))
				.get();
			if (latest) tx.delete(activityEvents).where(eq(activityEvents.id, latest.id)).run();
		}
	});
	applyAutoStatus(userId, title, prefs, 'unwatch');
}

/** Deletes specific events (the Undo button). Returns the affected title ids. */
export function deleteEvents(userId: number, eventIds: number[]): number[] {
	if (eventIds.length === 0) return [];
	const db = getDb();
	const rows = db
		.select({ titleId: activityEvents.titleId })
		.from(activityEvents)
		.where(and(eq(activityEvents.userId, userId), inArray(activityEvents.id, eventIds)))
		.all();
	db.delete(activityEvents)
		.where(and(eq(activityEvents.userId, userId), inArray(activityEvents.id, eventIds)))
		.run();
	return [...new Set(rows.map((r) => r.titleId))];
}

function hasActivity(userId: number, titleId: number): boolean {
	return (
		getDb()
			.select({ id: activityEvents.id })
			.from(activityEvents)
			.where(and(eq(activityEvents.userId, userId), eq(activityEvents.titleId, titleId)))
			.limit(1)
			.get() !== undefined
	);
}

/**
 * Automatic status rules (unless the user turned them off):
 * - watching something moves it to Watching (adding it to the library if needed),
 *   including from Watchlist, On hold and Dropped;
 * - every aired episode of an ended or canceled show watched → Completed;
 * - a Completed show with unwatched aired episodes → Watching;
 * - a watched movie → Completed; a movie with no plays left goes back to Watchlist.
 */
export function applyAutoStatus(
	userId: number,
	title: TitleRow,
	prefs: UserPrefs,
	trigger: 'watch' | 'unwatch' | 'refresh',
	at = new Date()
): void {
	const entry = getEntry(userId, title.id);
	const active = hasActivity(userId, title.id);

	// With automatic statuses off, only make sure something you watch is in your library.
	if (prefs.autoStatus === false) {
		if (!entry && active && trigger === 'watch') {
			setStatus(userId, title.id, title.mediaType === 'movie' ? 'completed' : 'in_progress');
		}
		if (trigger === 'watch') touchEntry(userId, title.id, at);
		return;
	}

	if (title.mediaType === 'movie') {
		if (active && entry?.status !== 'completed') setStatus(userId, title.id, 'completed');
		else if (!active && entry?.status === 'completed') setStatus(userId, title.id, 'planned');
		if (trigger === 'watch') touchEntry(userId, title.id, at);
		return;
	}

	if (!entry && !active) return;

	const all = titleEpisodes(title.id);
	const counts = watchCounts(userId, [title.id]);
	const progress = computeProgress(all, new Set(counts.keys()), {
		includeSpecials: prefs.includeSpecials
	});
	const finished = title.status === 'ended' || title.status === 'canceled';
	const allWatched = progress.aired > 0 && progress.watched === progress.aired;

	let status = entry?.status ?? null;
	if (trigger === 'watch' && status !== 'completed') status = 'in_progress';
	if (allWatched && finished && !progress.nextToAir) status = 'completed';
	else if (status === 'completed' && !allWatched) status = 'in_progress';
	if (!active && trigger === 'unwatch' && status === 'in_progress') status = 'planned';

	if (status && status !== entry?.status) setStatus(userId, title.id, status);
	if (trigger === 'watch') touchEntry(userId, title.id, at);
}
