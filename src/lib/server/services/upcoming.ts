import { and, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { titleHref } from '$lib/catalog/types';
import type { LibraryStatus } from '$lib/media-types/types';
import type { AnnouncedSeason, UpcomingItem } from '$lib/tracking/types';
import { getDb } from '../db/client';
import { episodes, libraryEntries, seasons, titles } from '../db/schema';
import { isAired, localDateString, toBrief, watchCounts } from './progress';

const DAY = 24 * 60 * 60 * 1000;

type Entry = { title: typeof titles.$inferSelect; status: LibraryStatus };

function libraryEntriesFor(userId: number): Map<number, Entry> {
	const rows = getDb()
		.select({ title: titles, status: libraryEntries.status })
		.from(libraryEntries)
		.innerJoin(titles, eq(titles.id, libraryEntries.titleId))
		.where(and(eq(libraryEntries.userId, userId), ne(libraryEntries.status, 'dropped')))
		.all();
	return new Map(rows.map((e) => [e.title.id, e]));
}

function baseItem(entry: Entry) {
	const { title, status } = entry;
	return {
		titleId: title.id,
		href: titleHref({ kind: title.kind, id: title.externalId }),
		name: title.name,
		mediaType: title.mediaType,
		isAnime: title.isAnime,
		poster: title.poster ?? null,
		backdrop: title.backdrop ?? null,
		status
	};
}

/**
 * Episodes and movie releases between two local dates (inclusive, "YYYY-MM-DD") for titles in the
 * user's library (everything except Dropped), with whether each one is already watched.
 */
export function scheduleBetween(userId: number, from: string, to: string): UpcomingItem[] {
	const byId = libraryEntriesFor(userId);
	if (byId.size === 0) return [];
	const ids = [...byId.keys()];
	const shift = (date: string, days: number) => {
		const [y, m, d] = date.split('-').map(Number);
		return localDateString(new Date(y, m - 1, d + days));
	};

	// A day of margin on both sides: exact times can move an episode across midnight.
	const rows = getDb()
		.select()
		.from(episodes)
		.where(
			and(
				inArray(episodes.titleId, ids),
				gte(episodes.airDate, shift(from, -1)),
				lte(episodes.airDate, shift(to, 1))
			)
		)
		.all();
	const watched = watchCounts(userId, [...new Set(rows.map((r) => r.titleId))]);

	const items: UpcomingItem[] = rows
		.map((episode) => ({
			...baseItem(byId.get(episode.titleId)!),
			episode: toBrief(episode),
			date: episode.airAt ? localDateString(new Date(episode.airAt)) : episode.airDate!,
			airAt: episode.airAt,
			watched: watched.has(episode.id)
		}))
		.filter((item) => item.date >= from && item.date <= to);

	for (const entry of byId.values()) {
		const { title } = entry;
		if (
			title.mediaType === 'movie' &&
			title.startDate &&
			title.startDate >= from &&
			title.startDate <= to
		) {
			items.push({
				...baseItem(entry),
				episode: null,
				date: title.startDate,
				airAt: null,
				watched: entry.status === 'completed'
			});
		}
	}

	return items.sort(
		(a, b) =>
			a.date.localeCompare(b.date) ||
			(a.airAt ?? '9').localeCompare(b.airAt ?? '9') ||
			a.name.localeCompare(b.name) ||
			(a.episode?.number ?? 0) - (b.episode?.number ?? 0)
	);
}

/**
 * What's coming: episodes and releases in the next `days` days, plus seasons announced further out
 * or without a date.
 */
export function upcoming(
	userId: number,
	{ days = 30, now = new Date() }: { days?: number; now?: Date } = {}
): { items: UpcomingItem[]; announced: AnnouncedSeason[] } {
	const today = localDateString(now);
	const horizon = localDateString(new Date(now.getTime() + days * DAY));
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

	// Keep today's already-aired episodes; they're shown as "Aired".
	const items = scheduleBetween(userId, today, horizon).filter(
		(item) => !item.airAt || new Date(item.airAt) >= startOfToday
	);

	const byId = libraryEntriesFor(userId);
	const announced = announcedSeasons(
		[...byId.keys()],
		byId,
		(id) => baseItem(byId.get(id)!),
		horizon,
		now
	);
	return { items, announced };
}

function announcedSeasons(
	ids: number[],
	byId: Map<number, { title: typeof titles.$inferSelect }>,
	base: (id: number) => Omit<UpcomingItem, 'episode' | 'date' | 'airAt'>,
	horizon: string,
	now: Date
): AnnouncedSeason[] {
	const db = getDb();
	const showIds = ids.filter((id) => {
		const { title } = byId.get(id)!;
		return title.mediaType !== 'movie' && title.status !== 'ended' && title.status !== 'canceled';
	});
	if (showIds.length === 0) return [];

	const allEpisodes = db.select().from(episodes).where(inArray(episodes.titleId, showIds)).all();
	const lastAiredSeason = new Map<number, number>();
	for (const e of allEpisodes) {
		if (e.seasonNumber > 0 && isAired(e, now)) {
			lastAiredSeason.set(e.titleId, Math.max(lastAiredSeason.get(e.titleId) ?? 0, e.seasonNumber));
		}
	}

	const result: AnnouncedSeason[] = [];
	const allSeasons = db.select().from(seasons).where(inArray(seasons.titleId, showIds)).all();
	for (const id of showIds) {
		const last = lastAiredSeason.get(id) ?? 0;
		const next = allSeasons
			.filter((s) => s.titleId === id && s.number > last && s.number > 0)
			.sort((a, b) => a.number - b.number)[0];
		if (!next || last === 0) continue;
		// Seasons starting inside the window already appear as episodes.
		if (next.airDate && next.airDate <= horizon) continue;
		const { name, href, poster } = base(id);
		result.push({
			titleId: id,
			href,
			name,
			poster,
			seasonNumber: next.number,
			airDate: next.airDate
		});
	}
	return result.sort(
		(a, b) =>
			(a.airDate ?? '9999').localeCompare(b.airDate ?? '9999') || a.name.localeCompare(b.name)
	);
}
