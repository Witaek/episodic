import { and, desc, eq, lt, or, type SQL } from 'drizzle-orm';
import { titleHref } from '$lib/catalog/types';
import type { HistoryItem } from '$lib/tracking/types';
import { getDb } from '../db/client';
import { activityEvents, episodes, titles } from '../db/schema';

export type { HistoryItem };

export type HistoryType = 'all' | 'tv' | 'anime' | 'movie';

/** Cursor-paginated watch history, newest first. The cursor is "<epoch ms>:<event id>". */
export function listHistory(
	userId: number,
	{
		cursor,
		limit = 60,
		type = 'all'
	}: { cursor?: string | null; limit?: number; type?: HistoryType } = {}
): { items: HistoryItem[]; nextCursor: string | null } {
	const conditions: SQL[] = [eq(activityEvents.userId, userId)];
	if (cursor) {
		const [time, id] = cursor.split(':').map(Number);
		if (Number.isFinite(time) && Number.isFinite(id)) {
			const at = new Date(time);
			conditions.push(
				or(
					lt(activityEvents.occurredAt, at),
					and(eq(activityEvents.occurredAt, at), lt(activityEvents.id, id))
				)!
			);
		}
	}
	if (type === 'movie') conditions.push(eq(titles.mediaType, 'movie'));
	if (type === 'tv') conditions.push(eq(titles.mediaType, 'show'));
	if (type === 'anime') conditions.push(eq(titles.isAnime, true));

	const rows = getDb()
		.select({ event: activityEvents, title: titles, episode: episodes })
		.from(activityEvents)
		.innerJoin(titles, eq(titles.id, activityEvents.titleId))
		.leftJoin(episodes, eq(episodes.id, activityEvents.unitId))
		.where(and(...conditions))
		.orderBy(desc(activityEvents.occurredAt), desc(activityEvents.id))
		.limit(limit + 1)
		.all();

	const page = rows.slice(0, limit);
	const last = page.at(-1);
	return {
		items: page.map(({ event, title, episode }) => ({
			eventId: event.id,
			occurredAt: event.occurredAt.toISOString(),
			isRepeat: event.isRepeat,
			title: {
				id: title.id,
				name: title.name,
				href: titleHref(
					{ kind: title.kind, id: title.externalId },
					episode ? episode.seasonNumber : null
				),
				mediaType: title.mediaType,
				isAnime: title.isAnime,
				poster: title.poster ?? null
			},
			episode: episode
				? {
						seasonNumber: episode.seasonNumber,
						number: episode.number,
						name: episode.name,
						still: episode.still ?? null,
						runtime: episode.runtime
					}
				: null,
			runtime: episode?.runtime ?? title.runtime
		})),
		nextCursor:
			rows.length > limit && last ? `${last.event.occurredAt.getTime()}:${last.event.id}` : null
	};
}

/** Changes when an event happened. Returns false if it isn't the user's. */
export function updateEventTime(userId: number, eventId: number, occurredAt: Date): boolean {
	return (
		getDb()
			.update(activityEvents)
			.set({ occurredAt })
			.where(and(eq(activityEvents.id, eventId), eq(activityEvents.userId, userId)))
			.run().changes > 0
	);
}
