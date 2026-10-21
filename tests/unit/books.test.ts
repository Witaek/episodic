import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TitleDetails } from '../../src/lib/catalog/types';
import {
	cleanSubjects,
	coverImage,
	mapDoc,
	workId
} from '../../src/lib/server/providers/openlibrary';

const dataDir = mkdtempSync(join(tmpdir(), 'episodic-test-'));
process.env.DATA_DIR = dataDir;

const { runMigrations, closeDb } = await import('../../src/lib/server/db/client');
const { createUser } = await import('../../src/lib/server/auth');
const { storeTitle } = await import('../../src/lib/server/services/titles');
const library = await import('../../src/lib/server/services/library');
const tracking = await import('../../src/lib/server/services/tracking');
const { listHistory } = await import('../../src/lib/server/services/history');
const { watchStats } = await import('../../src/lib/server/services/stats');
const { readingStats } = await import('../../src/lib/server/services/reading-stats');
const portability = await import('../../src/lib/server/services/portability');

describe('open library mapping', () => {
	it('maps search docs and ids', () => {
		expect(workId('/works/OL21745884W')).toBe('21745884');
		expect(workId('/books/OL1M')).toBeNull();
		expect(
			mapDoc({
				key: '/works/OL21745884W',
				title: 'Project Hail Mary',
				author_name: ['Andy Weir'],
				first_publish_year: 2021,
				cover_i: 11200092,
				ratings_average: 4.52
			})
		).toMatchObject({
			href: '/read/book/21745884',
			mediaType: 'book',
			year: 2021,
			rating: 9,
			badge: 'Andy Weir',
			poster: { url: 'https://covers.openlibrary.org/b/id/11200092-L.jpg' }
		});
		expect(coverImage(undefined)).toBeNull();
	});

	it('keeps readable subjects only', () => {
		expect(
			cleanSubjects([
				'science-fiction',
				'nyt:hardcover-fiction=2021-05-23',
				'Science-fiction',
				'Space flight'
			])
		).toEqual(['Science-fiction', 'Space flight']);
	});
});

const book: TitleDetails = {
	ref: { provider: 'openlibrary', kind: 'book', id: '21745884' },
	mediaType: 'book',
	isAnime: false,
	name: 'Project Hail Mary',
	originalName: null,
	tagline: null,
	overview: null,
	poster: null,
	backdrop: null,
	logo: null,
	genres: ['Science fiction'],
	status: 'released',
	startDate: '2021-01-01',
	endDate: null,
	runtime: null,
	pages: 496,
	rating: 9,
	certification: null,
	companies: ['Andy Weir'],
	cast: [],
	seasons: [],
	episodeCount: null,
	nextEpisode: null,
	lastEpisode: null,
	recommendations: [],
	trailerUrl: null,
	externalIds: { openlibrary: 'OL21745884W' },
	sourceUrl: null
};

let userId: number;

beforeAll(async () => {
	runMigrations();
	userId = await createUser({ username: 'reader', password: 'password1', role: 'user' });
});

afterAll(() => {
	closeDb();
	rmSync(dataDir, { recursive: true, force: true });
});

describe('reading', () => {
	it('tracks page progress and finishes at the last page', () => {
		const title = storeTitle('book', '21745884', book, []);
		expect(title.pages).toBe(496);

		library.setStatus(userId, title.id, 'planned');
		expect(tracking.setReadingProgress(userId, title, 120, {})).toEqual({ finished: false });
		let state = library.getUserTitleState(userId, title, {});
		expect(state).toMatchObject({ status: 'in_progress', reading: { page: 120, pages: 496 } });

		// Pages beyond the end are clamped, and finishing marks it as read.
		expect(tracking.setReadingProgress(userId, title, 900, {})).toEqual({ finished: true });
		state = library.getUserTitleState(userId, title, {});
		expect(state).toMatchObject({
			status: 'completed',
			watched: { movie: 1 },
			reading: { page: 496 }
		});

		const [event] = listHistory(userId).items;
		expect(event.title.mediaType).toBe('book');
		expect(event.episode).toBeNull();
	});

	it('marks as read directly, rereads, and counts in stats but not watch time', () => {
		const title = storeTitle('book', '21745884', book, []);
		tracking.watch(userId, title, { type: 'book' }, {}, { rewatch: true });
		expect(library.getUserTitleState(userId, title, {}).watched.movie).toBe(2);
		expect(() =>
			tracking.watch(userId, title, { type: 'episode', season: 1, number: 1 }, {})
		).toThrow();

		const stats = watchStats(userId, 'all');
		expect(stats.totals).toMatchObject({ minutes: 0, episodes: 0, movies: 0 });
		expect(stats.genres).toEqual([]);
		const reading = readingStats(userId, {}, 'all');
		expect(reading.totals).toMatchObject({ books: 2, pages: 992, volumes: 0 });
	});

	it('round-trips through export', () => {
		const data = portability.exportUserData(userId);
		expect(data.library[0].title).toMatchObject({ provider: 'openlibrary', kind: 'book' });
		expect(data.activity.every((a) => a.action === 'read')).toBe(true);
		expect(portability.exportSchema.safeParse(JSON.parse(JSON.stringify(data))).success).toBe(true);
	});
});
