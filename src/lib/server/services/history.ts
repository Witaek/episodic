import { and, desc, eq, inArray, lt, notInArray, or, type SQL } from 'drizzle-orm';
import { READ_MEDIA_TYPES, titleHref } from '$lib/catalog/types';
import type { Section } from '$lib/section';
import type { HistoryItem } from '$lib/tracking/types';
import { getDb } from '../db/client';
import { activityEvents, episodes, libraryEntries, titles } from '../db/schema';
import { editionsFor } from './books';

export type { HistoryItem };

export type HistoryType = 'all' | 'tv' | 'anime' | 'movie' | 'book' | 'manga';

/** Type filters offered on each side's history. */
export const HISTORY_TYPES: Record<Section, HistoryType[]> = {
	watch: ['all', 'tv', 'anime', 'movie'],
	read: ['all', 'book', 'manga']
};

/** Cursor-paginated watch history, newest first. The cursor is "<epoch ms>:<event id>". */
export function listHistory(
	userId: number,
	{
		cursor,
		limit = 60,
		type = 'all',
		section
	}: { cursor?: string | null; limit?: number; type?: HistoryType; section?: Section } = {}
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
	if (type === 'book') conditions.push(inArray(titles.mediaType, ['book', 'bookseries']));
	if (type === 'manga') conditions.push(eq(titles.mediaType, 'manga'));
	const read = [...READ_MEDIA_TYPES];
	if (section === 'read') conditions.push(inArray(titles.mediaType, read));
	if (section === 'watch') conditions.push(notInArray(titles.mediaType, read));
	if (type === 'tv') conditions.push(eq(titles.mediaType, 'show'));
	if (type === 'anime') conditions.push(eq(titles.isAnime, true));

	const rows = getDb()
		.select({ event: activityEvents, title: titles, episode: episodes, entry: libraryEntries })
		.from(activityEvents)
		.innerJoin(titles, eq(titles.id, activityEvents.titleId))
		.leftJoin(episodes, eq(episodes.id, activityEvents.unitId))
		.leftJoin(
			libraryEntries,
			and(eq(libraryEntries.titleId, titles.id), eq(libraryEntries.userId, userId))
		)
		.where(and(...conditions))
		.orderBy(desc(activityEvents.occurredAt), desc(activityEvents.id))
		.limit(limit + 1)
		.all();

	const page = rows.slice(0, limit);
	const last = page.at(-1);
	// Books, and books of a series, show the reader's edition.
	const workOf = (r: (typeof page)[number]) =>
		r.title.kind === 'book'
			? r.title.externalId
			: r.title.mediaType === 'bookseries'
				? (r.episode?.externalId ?? null)
				: null;
	const editions = editionsFor(
		userId,
		page.map(workOf).filter((w): w is string => !!w)
	);
	return {
		items: page.map((row) => {
			const { event, title, episode } = row;
			const work = workOf(row);
			const chosen = work ? editions.get(work) : undefined;
			const edition = title.kind === 'book' ? chosen : undefined;
			return {
				eventId: event.id,
				occurredAt: event.occurredAt.toISOString(),
				isRepeat: event.isRepeat,
				title: {
					id: title.id,
					name: edition?.title || title.name,
					href: titleHref(
						{ kind: title.kind, id: title.externalId },
						episode ? episode.seasonNumber : null
					),
					mediaType: title.mediaType,
					isAnime: title.isAnime,
					poster: edition?.cover ?? title.poster ?? null
				},
				episode: episode
					? {
							seasonNumber: episode.seasonNumber,
							number: episode.number,
							name: (title.kind !== 'book' && chosen?.title) || episode.name,
							still: (title.kind !== 'book' && chosen?.cover) || episode.still || null,
							runtime: episode.runtime
						}
					: null,
				runtime: episode?.runtime ?? title.runtime
			};
		}),
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
