import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Episode, SearchResult, Season, TitleDetails } from '../../src/lib/catalog/types';
import { isIsbn } from '../../src/lib/scan';

const dataDir = mkdtempSync(join(tmpdir(), 'episodic-test-'));
process.env.DATA_DIR = dataDir;
// No network in tests: provider calls fail fast.
vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));

const { runMigrations, closeDb } = await import('../../src/lib/server/db/client');
const { createUser } = await import('../../src/lib/server/auth');
const { storeTitle, titleEpisodes } = await import('../../src/lib/server/services/titles');
const library = await import('../../src/lib/server/services/library');
const tracking = await import('../../src/lib/server/services/tracking');
const { listHistory } = await import('../../src/lib/server/services/history');
const { readingStats } = await import('../../src/lib/server/services/reading-stats');
const { foldIntoSeries } = await import('../../src/lib/server/services/read-search');
const bookSeries = await import('../../src/lib/server/services/book-series');
const portability = await import('../../src/lib/server/services/portability');

const base: Omit<TitleDetails, 'ref' | 'mediaType' | 'name'> = {
	isAnime: false,
	originalName: null,
	tagline: null,
	overview: null,
	poster: null,
	backdrop: null,
	logo: null,
	genres: ['Fantasy'],
	status: 'ended',
	startDate: '1997-06-26',
	endDate: null,
	runtime: null,
	pages: null,
	rating: null,
	certification: null,
	companies: [],
	cast: [],
	seasons: [],
	episodeCount: null,
	nextEpisode: null,
	lastEpisode: null,
	recommendations: [],
	trailerUrl: null,
	externalIds: {},
	sourceUrl: null
};

const unit = (season: number, number: number, extra: Partial<Episode> = {}): Episode => ({
	id: `${season}-${number}`,
	seasonNumber: season,
	number,
	name: `Unit ${number}`,
	overview: null,
	airDate: '1900-01-01',
	still: null,
	runtime: null,
	rating: null,
	...extra
});

const seasonOf = (number: number, episodes: Episode[]): Season => ({
	number,
	name: `Volume ${number}`,
	overview: null,
	airDate: null,
	poster: null,
	episodeCount: episodes.length,
	episodes
});

const result = (id: string, name: string): SearchResult => ({
	ref: { provider: 'openlibrary', kind: 'book', id },
	href: `/read/book/${id}`,
	mediaType: 'book',
	isAnime: false,
	name,
	year: 2000,
	poster: { url: `cover-${id}` },
	backdrop: null,
	rating: null
});

let userId: number;

beforeAll(async () => {
	runMigrations();
	userId = await createUser({ username: 'reader', password: 'password1', role: 'user' });
});

afterAll(() => {
	closeDb();
	rmSync(dataDir, { recursive: true, force: true });
	vi.unstubAllGlobals();
});

describe('ISBN check', () => {
	it('accepts valid ISBN-13 and ISBN-10, rejects other barcodes', () => {
		expect(isIsbn('978-2-07-054127-0')).toBe(true);
		expect(isIsbn('2070541274')).toBe(true);
		expect(isIsbn('080442957X')).toBe(true);
		expect(isIsbn('9782070541271')).toBe(false); // wrong check digit
		expect(isIsbn('3017620422003')).toBe(false); // a product barcode, not a book
	});
});

describe('search folding', () => {
	it('shows books of a series as one series card, with book 1 as the cover', () => {
		const results = [
			result('2', 'Chamber of Secrets'),
			result('9', 'A standalone novel'),
			result('1', "Philosopher's Stone")
		];
		const memberships = new Map([
			['1', { series: '8337', seriesName: 'Harry Potter', ordinal: '1' }],
			['2', { series: '8337', seriesName: 'Harry Potter', ordinal: '2' }]
		]);
		const folded = foldIntoSeries(results, memberships);
		expect(folded.map((r) => r.name)).toEqual(['Harry Potter', 'A standalone novel']);
		expect(folded[0]).toMatchObject({
			href: '/read/series/8337',
			mediaType: 'bookseries',
			badge: 'Series',
			poster: { url: 'cover-1' }
		});
	});
});

describe('Watch and Read stay apart', () => {
	it('filters the library and history by section', () => {
		const show = storeTitle(
			'tv',
			'100',
			{
				...base,
				ref: { provider: 'tmdb', kind: 'tv', id: '100' },
				mediaType: 'show',
				name: 'A show'
			},
			[]
		);
		const novel = storeTitle(
			'book',
			'500',
			{
				...base,
				ref: { provider: 'openlibrary', kind: 'book', id: '500' },
				mediaType: 'book',
				name: 'A novel',
				status: 'released'
			},
			[]
		);
		library.setStatus(userId, show.id, 'planned');
		tracking.watch(userId, novel, { type: 'book' }, {});

		const names = (section: 'watch' | 'read') =>
			library.listLibrary(userId, {}, { section }).map((i) => i.name);
		expect(names('watch')).toEqual(['A show']);
		expect(names('read')).toEqual(['A novel']);
		expect(listHistory(userId, { section: 'watch' }).items).toHaveLength(0);
		expect(listHistory(userId, { section: 'read' }).items[0].title.name).toBe('A novel');
	});
});

describe('books move into their series', () => {
	it('moves reads, page and status of a single book into the series', () => {
		const work = '82563';
		const book = storeTitle(
			'book',
			work,
			{
				...base,
				ref: { provider: 'openlibrary', kind: 'book', id: work },
				mediaType: 'book',
				name: 'Book one',
				status: 'released',
				pages: 300
			},
			[]
		);
		const books = [1, 2, 3].map((n) =>
			unit(1, n, { name: `Book ${n}`, work: n === 1 ? work : `9${n}`, pages: 300 })
		);
		const series = storeTitle(
			'series',
			'8337',
			{
				...base,
				ref: { provider: 'wikidata', kind: 'series', id: '8337' },
				mediaType: 'bookseries',
				name: 'The series',
				seasons: [{ number: 1, name: 'Books', airDate: null, poster: null, episodeCount: 3 }],
				episodeCount: 3
			},
			[seasonOf(1, books)]
		);
		tracking.watch(userId, book, { type: 'book' }, {});
		tracking.watch(userId, book, { type: 'book' }, {}, { rewatch: true });

		const unitRow = titleEpisodes(series.id).find((e) => e.number === 1)!;
		expect(bookSeries.absorbBook(userId, book, series, unitRow, {})).toBe(true);

		expect(library.getEntry(userId, book.id)).toBeUndefined();
		const state = library.getUserTitleState(userId, series, {});
		expect(state.status).toBe('in_progress');
		expect(state.watched).toEqual({ '1-1': 2 });
		expect(state.progress?.nextUp?.number).toBe(2);

		const history = listHistory(userId, { section: 'read' }).items.filter(
			(i) => i.title.name === 'The series'
		);
		expect(history.map((i) => i.isRepeat).sort()).toEqual([false, true]);
		// Nothing left to move the second time.
		expect(bookSeries.absorbBook(userId, book, series, unitRow, {})).toBe(false);
	});
});

describe('reading stats', () => {
	it('counts books, finished manga volumes, chapters and the yearly goal', () => {
		const manga = storeTitle(
			'manga',
			'30002',
			{
				...base,
				ref: { provider: 'anilist', kind: 'manga', id: '30002' },
				mediaType: 'manga',
				name: 'A manga',
				seasons: [
					{
						number: 1,
						name: 'Volume 1',
						airDate: null,
						poster: null,
						episodeCount: 2
					},
					{
						number: 2,
						name: 'Volume 2',
						airDate: null,
						poster: null,
						episodeCount: 2
					}
				],
				episodeCount: 4
			},
			[seasonOf(1, [unit(1, 1), unit(1, 2)]), seasonOf(2, [unit(2, 3), unit(2, 4)])]
		);
		tracking.watch(userId, manga, { type: 'season', season: 1 }, {});
		tracking.watch(userId, manga, { type: 'episode', season: 2, number: 3 }, {});

		const year = new Date().getFullYear();
		const stats = readingStats(userId, { readingGoal: { year, books: 10 } }, 'year');
		expect(stats.totals.volumes).toBe(1);
		expect(stats.totals.chapters).toBe(3);
		// The novel, plus two reads of book one of the series.
		expect(stats.totals.books).toBe(3);
		expect(stats.goal).toEqual({ year, target: 10, done: 4 });
		// A goal from another year doesn't count.
		expect(
			readingStats(userId, { readingGoal: { year: year - 1, books: 5 } }, 'year').goal.target
		).toBeNull();
	});
});

describe('series grouped by hand', () => {
	it('restores a collection from an export even offline, and exports its books', async () => {
		const collection = await bookSeries.restoreCollection('My trilogy', [
			{ number: 1, name: 'First', work: '7001' },
			{ number: 2, name: 'Second', work: '7002' }
		]);
		expect(collection).toMatchObject({ kind: 'collection', mediaType: 'bookseries' });
		expect(bookSeries.collectionOfWork('7002')?.unit.number).toBe(2);
		expect(bookSeries.listCollections()).toEqual([
			{ id: collection.externalId, name: 'My trilogy', books: 2 }
		]);
		// Same name again: reused, not duplicated.
		expect((await bookSeries.restoreCollection('My trilogy', [])).id).toBe(collection.id);

		library.setStatus(userId, collection.id, 'planned');
		const exported = portability.exportUserData(userId);
		const ref = exported.library.find((e) => e.title.kind === 'collection')!.title;
		expect(ref.volumes).toEqual([
			{ number: 1, name: 'First', work: '7001' },
			{ number: 2, name: 'Second', work: '7002' }
		]);
		expect(portability.exportSchema.safeParse(JSON.parse(JSON.stringify(exported))).success).toBe(
			true
		);
	});
});
