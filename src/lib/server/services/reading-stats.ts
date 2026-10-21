import { and, eq, inArray, sql } from 'drizzle-orm';
import { READ_MEDIA_TYPES, titleHref, type Image } from '$lib/catalog/types';
import { getDb } from '../db/client';
import { activityEvents, episodes, titles, type UserPrefs } from '../db/schema';
import { localDateString } from './progress';
import { streaks, type StatsRange } from './stats';

export interface ReadingStats {
	range: StatsRange;
	totals: {
		/** Books finished: single books and books of a series. */
		books: number;
		/** Manga volumes finished (every chapter of the volume read). */
		volumes: number;
		chapters: number;
		pages: number;
		titles: number;
		currentStreak: number;
		longestStreak: number;
	};
	/** This year's goal, counting books and manga volumes finished this year. */
	goal: { year: number; target: number | null; done: number };
	/** Last 12 months, oldest first. */
	months: { month: string; books: number; volumes: number }[];
	genres: { genre: string; count: number }[];
	topTitles: {
		titleId: number;
		name: string;
		href: string;
		poster: Image | null;
		mediaType: string;
		count: number;
	}[];
}

const monthKey = (date: Date) => localDateString(date).slice(0, 7);

/** Reading numbers for the Read side: books, volumes, pages, the yearly goal. */
export function readingStats(
	userId: number,
	prefs: UserPrefs,
	range: StatsRange,
	now = new Date()
): ReadingStats {
	const db = getDb();
	const rows = db
		.select({
			occurredAt: activityEvents.occurredAt,
			isRepeat: activityEvents.isRepeat,
			titleId: titles.id,
			kind: titles.kind,
			externalId: titles.externalId,
			name: titles.name,
			poster: titles.poster,
			mediaType: titles.mediaType,
			genres: titles.genres,
			titlePages: titles.pages,
			season: episodes.seasonNumber,
			unitPages: episodes.pages
		})
		.from(activityEvents)
		.innerJoin(titles, eq(titles.id, activityEvents.titleId))
		.leftJoin(episodes, eq(episodes.id, activityEvents.unitId))
		.where(and(eq(activityEvents.userId, userId), inArray(titles.mediaType, [...READ_MEDIA_TYPES])))
		.all();

	// A manga volume is finished on the day its last chapter was read.
	const mangaIds = [...new Set(rows.filter((r) => r.mediaType === 'manga').map((r) => r.titleId))];
	const chaptersPerVolume = new Map<string, number>();
	if (mangaIds.length) {
		for (const row of db
			.select({
				titleId: episodes.titleId,
				season: episodes.seasonNumber,
				n: sql<number>`count(*)`
			})
			.from(episodes)
			.where(inArray(episodes.titleId, mangaIds))
			.groupBy(episodes.titleId, episodes.seasonNumber)
			.all()) {
			chaptersPerVolume.set(`${row.titleId}:${row.season}`, row.n);
		}
	}
	const volumeReads = new Map<string, { units: number; last: Date; row: (typeof rows)[number] }>();
	for (const r of rows) {
		if (r.mediaType !== 'manga' || r.season === null || r.isRepeat) continue;
		const key = `${r.titleId}:${r.season}`;
		const v = volumeReads.get(key) ?? { units: 0, last: r.occurredAt, row: r };
		v.units++;
		if (r.occurredAt > v.last) v.last = r.occurredAt;
		volumeReads.set(key, v);
	}
	const finishedVolumes = [...volumeReads]
		.filter(([key, v]) => v.units >= (chaptersPerVolume.get(key) ?? Infinity))
		.map(([, v]) => ({ ...v.row, occurredAt: v.last }));

	// Books: a whole-book read, or one book of a series.
	const bookReads = rows.filter((r) => r.mediaType === 'book' || r.mediaType === 'bookseries');

	const yearStart = new Date(now.getFullYear(), 0, 1);
	const inRange = <T extends { occurredAt: Date }>(list: T[]) =>
		range === 'all' ? list : list.filter((r) => r.occurredAt >= yearStart);
	const books = inRange(bookReads);
	const volumes = inRange(finishedVolumes);
	const chapters = inRange(rows.filter((r) => r.mediaType === 'manga'));

	const months: ReadingStats['months'] = [];
	for (let i = 11; i >= 0; i--) {
		const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
		months.push({ month: monthKey(date), books: 0, volumes: 0 });
	}
	const monthIndex = new Map(months.map((m, i) => [m.month, i]));
	for (const r of bookReads) {
		const i = monthIndex.get(monthKey(r.occurredAt));
		if (i !== undefined) months[i].books++;
	}
	for (const r of finishedVolumes) {
		const i = monthIndex.get(monthKey(r.occurredAt));
		if (i !== undefined) months[i].volumes++;
	}

	const finished = [...books, ...volumes];
	const genres = new Map<string, number>();
	const perTitle = new Map<number, ReadingStats['topTitles'][number]>();
	for (const r of finished) {
		for (const genre of r.genres) genres.set(genre, (genres.get(genre) ?? 0) + 1);
		const entry = perTitle.get(r.titleId) ?? {
			titleId: r.titleId,
			name: r.name,
			href: titleHref({ kind: r.kind, id: r.externalId }),
			poster: r.poster ?? null,
			mediaType: r.mediaType,
			count: 0
		};
		entry.count++;
		perTitle.set(r.titleId, entry);
	}

	const inYearRange = inRange(rows);
	const { current, longest } = streaks(
		inYearRange.map((r) => localDateString(r.occurredAt)),
		localDateString(now)
	);
	const year = now.getFullYear();
	const goal = prefs.readingGoal?.year === year ? prefs.readingGoal.books : null;
	const doneThisYear =
		bookReads.filter((r) => r.occurredAt >= yearStart).length +
		finishedVolumes.filter((r) => r.occurredAt >= yearStart).length;

	return {
		range,
		totals: {
			books: books.length,
			volumes: volumes.length,
			chapters: chapters.length,
			pages: books.reduce((sum, r) => sum + (r.unitPages ?? r.titlePages ?? 0), 0),
			titles: new Set(inYearRange.map((r) => r.titleId)).size,
			currentStreak: current,
			longestStreak: longest
		},
		goal: { year, target: goal, done: doneThisYear },
		months,
		genres: [...genres]
			.map(([genre, count]) => ({ genre, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 8),
		topTitles: [...perTitle.values()].sort((a, b) => b.count - a.count).slice(0, 10)
	};
}
