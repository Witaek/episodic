import { eq } from 'drizzle-orm';
import { isReadType, titleHref, type Image } from '$lib/catalog/types';
import { getDb } from '../db/client';
import { activityEvents, episodes, libraryEntries, titles } from '../db/schema';
import { localDateString } from './progress';

export type StatsCategory = 'show' | 'anime' | 'movie';
export type StatsRange = 'year' | 'all';

export interface WatchStats {
	range: StatsRange;
	totals: {
		minutes: number;
		episodes: number;
		movies: number;
		titles: number;
		completed: number;
		currentStreak: number;
		longestStreak: number;
	};
	/** Last 12 months, oldest first, minutes per category. */
	months: { month: string; minutes: Record<StatsCategory, number> }[];
	genres: { genre: string; minutes: number }[];
	topTitles: {
		titleId: number;
		name: string;
		href: string;
		poster: Image | null;
		episodes: number;
		minutes: number;
	}[];
}

/** Typical lengths when a provider has no runtime. */
const FALLBACK_MINUTES: Record<StatsCategory, number> = { show: 40, anime: 24, movie: 110 };

const monthKey = (date: Date) => localDateString(date).slice(0, 7);

/** Longest run of consecutive days in a sorted list of "YYYY-MM-DD", and the run ending now. */
export function streaks(days: string[], today: string): { current: number; longest: number } {
	const unique = [...new Set(days)].sort();
	const toDay = (s: string) => {
		const [y, m, d] = s.split('-').map(Number);
		return Math.round(new Date(y, m - 1, d).getTime() / 86_400_000);
	};
	let longest = 0;
	let run = 0;
	let previous: number | null = null;
	for (const day of unique) {
		const n = toDay(day);
		run = previous !== null && n === previous + 1 ? run + 1 : 1;
		longest = Math.max(longest, run);
		previous = n;
	}
	// The current streak counts if the last active day is today or yesterday.
	const last = previous;
	const current = last !== null && toDay(today) - last <= 1 ? run : 0;
	return { current, longest };
}

export function watchStats(userId: number, range: StatsRange, now = new Date()): WatchStats {
	const db = getDb();
	const rows = db
		.select({
			occurredAt: activityEvents.occurredAt,
			unitId: activityEvents.unitId,
			titleId: titles.id,
			kind: titles.kind,
			externalId: titles.externalId,
			name: titles.name,
			poster: titles.poster,
			mediaType: titles.mediaType,
			isAnime: titles.isAnime,
			genres: titles.genres,
			titleRuntime: titles.runtime,
			episodeRuntime: episodes.runtime
		})
		.from(activityEvents)
		.innerJoin(titles, eq(titles.id, activityEvents.titleId))
		.leftJoin(episodes, eq(episodes.id, activityEvents.unitId))
		.where(eq(activityEvents.userId, userId))
		.all();

	// Reading has its own stats (see reading-stats.ts).
	const watched = rows.filter((r) => !isReadType(r.mediaType));
	const yearStart = new Date(now.getFullYear(), 0, 1);
	const inRange = range === 'all' ? watched : watched.filter((r) => r.occurredAt >= yearStart);

	const category = (r: (typeof rows)[number]): StatsCategory =>
		r.mediaType === 'movie' ? 'movie' : r.isAnime ? 'anime' : 'show';
	const minutesOf = (r: (typeof rows)[number]) =>
		r.episodeRuntime ?? r.titleRuntime ?? FALLBACK_MINUTES[category(r)];

	// Last 12 months (always, regardless of range).
	const months: WatchStats['months'] = [];
	for (let i = 11; i >= 0; i--) {
		const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
		months.push({ month: monthKey(date), minutes: { show: 0, anime: 0, movie: 0 } });
	}
	const monthIndex = new Map(months.map((m, i) => [m.month, i]));
	for (const r of watched) {
		const i = monthIndex.get(monthKey(r.occurredAt));
		if (i !== undefined) months[i].minutes[category(r)] += minutesOf(r);
	}

	const genres = new Map<string, number>();
	const perTitle = new Map<number, WatchStats['topTitles'][number]>();
	let minutes = 0;
	let episodesCount = 0;
	let movies = 0;
	for (const r of inRange) {
		const m = minutesOf(r);
		minutes += m;
		if (r.unitId) episodesCount++;
		else movies++;
		for (const genre of r.genres) genres.set(genre, (genres.get(genre) ?? 0) + m);
		const entry = perTitle.get(r.titleId) ?? {
			titleId: r.titleId,
			name: r.name,
			href: titleHref({ kind: r.kind, id: r.externalId }),
			poster: r.poster ?? null,
			episodes: 0,
			minutes: 0
		};
		entry.minutes += m;
		if (r.unitId) entry.episodes++;
		perTitle.set(r.titleId, entry);
	}

	// "Completed" counts titles marked completed (in the year, by when they last changed).
	const completedInRange = db
		.select({ status: libraryEntries.status, updatedAt: libraryEntries.updatedAt })
		.from(libraryEntries)
		.where(eq(libraryEntries.userId, userId))
		.all()
		.filter(
			(e) => e.status === 'completed' && (range === 'all' || e.updatedAt >= yearStart)
		).length;

	const { current, longest } = streaks(
		inRange.map((r) => localDateString(r.occurredAt)),
		localDateString(now)
	);

	return {
		range,
		totals: {
			minutes,
			episodes: episodesCount,
			movies,
			titles: perTitle.size,
			completed: completedInRange,
			currentStreak: current,
			longestStreak: longest
		},
		months,
		genres: [...genres]
			.map(([genre, m]) => ({ genre, minutes: m }))
			.sort((a, b) => b.minutes - a.minutes)
			.slice(0, 8),
		topTitles: [...perTitle.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 10)
	};
}
