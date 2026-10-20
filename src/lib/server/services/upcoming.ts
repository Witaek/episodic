import { and, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { titleHref } from '$lib/catalog/types';
import type { AnnouncedSeason, UpcomingItem } from '$lib/tracking/types';
import { getDb } from '../db/client';
import { episodes, libraryEntries, seasons, titles } from '../db/schema';
import { isAired, localDateString, toBrief } from './progress';

const DAY = 24 * 60 * 60 * 1000;

/**
 * What's coming for titles in the user's library (everything except Dropped): episodes and
 * movie releases in the next `days` days, plus seasons announced further out or without a date.
 */
export function upcoming(
	userId: number,
	{ days = 30, now = new Date() }: { days?: number; now?: Date } = {}
): { items: UpcomingItem[]; announced: AnnouncedSeason[] } {
	const db = getDb();
	const today = localDateString(now);
	const horizon = localDateString(new Date(now.getTime() + days * DAY));
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

	const entries = db
		.select({ title: titles, status: libraryEntries.status })
		.from(libraryEntries)
		.innerJoin(titles, eq(titles.id, libraryEntries.titleId))
		.where(and(eq(libraryEntries.userId, userId), ne(libraryEntries.status, 'dropped')))
		.all();
	if (entries.length === 0) return { items: [], announced: [] };
	const byId = new Map(entries.map((e) => [e.title.id, e]));
	const ids = [...byId.keys()];

	const base = (id: number) => {
		const { title, status } = byId.get(id)!;
		return {
			titleId: id,
			href: titleHref({ kind: title.kind, id: title.externalId }),
			name: title.name,
			mediaType: title.mediaType,
			isAnime: title.isAnime,
			poster: title.poster ?? null,
			backdrop: title.backdrop ?? null,
			status
		};
	};

	// A day of margin on both sides: exact times can move an episode across midnight.
	const yesterday = localDateString(new Date(now.getTime() - DAY));
	const dayAfter = localDateString(new Date(now.getTime() + (days + 1) * DAY));
	const items: UpcomingItem[] = db
		.select()
		.from(episodes)
		.where(
			and(
				inArray(episodes.titleId, ids),
				gte(episodes.airDate, yesterday),
				lte(episodes.airDate, dayAfter)
			)
		)
		.all()
		.map((episode) => ({
			...base(episode.titleId),
			episode: toBrief(episode),
			date: episode.airAt ? localDateString(new Date(episode.airAt)) : episode.airDate!,
			airAt: episode.airAt
		}))
		.filter((item) => item.date >= today && item.date <= horizon)
		// Keep today's already-aired episodes; they're shown as "Aired".
		.filter((item) => !item.airAt || new Date(item.airAt) >= startOfToday);

	for (const { title } of entries) {
		if (
			title.mediaType === 'movie' &&
			title.startDate &&
			title.startDate >= today &&
			title.startDate <= horizon
		) {
			items.push({ ...base(title.id), episode: null, date: title.startDate, airAt: null });
		}
	}

	items.sort(
		(a, b) =>
			a.date.localeCompare(b.date) ||
			(a.airAt ?? '9').localeCompare(b.airAt ?? '9') ||
			a.name.localeCompare(b.name) ||
			(a.episode?.number ?? 0) - (b.episode?.number ?? 0)
	);

	return { items, announced: announcedSeasons(ids, byId, base, horizon, now) };
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
