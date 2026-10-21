import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BookEdition, SearchResult, TitleDetails } from '../../src/lib/catalog/types';
import { mapDoc } from '../../src/lib/server/providers/openlibrary';

const dataDir = mkdtempSync(join(tmpdir(), 'episodic-test-'));
process.env.DATA_DIR = dataDir;
process.env.TMDB_ACCESS_TOKEN = 'test-token';

const { runMigrations, closeDb, getDb } = await import('../../src/lib/server/db/client');
const { animeMappings, apiCache } = await import('../../src/lib/server/db/schema');
const { createUser } = await import('../../src/lib/server/auth');
const franchise = await import('../../src/lib/server/services/franchise');
const { foldAnimeMovies } = await import('../../src/lib/server/services/catalog');
const { storeTitle } = await import('../../src/lib/server/services/titles');
const library = await import('../../src/lib/server/services/library');
const { rememberEdition } = await import('../../src/lib/server/services/books');
const tracking = await import('../../src/lib/server/services/tracking');

const mapping = (anilistId: number, tv: number | null, movie: number | null) => ({
	anilistId,
	malId: null,
	format: movie ? 'MOVIE' : 'TV',
	tmdbTvId: tv,
	tmdbMovieId: movie,
	tmdbSeason: tv ? 1 : null,
	tmdbEpisodeOffset: null,
	tvdbId: 348545,
	imdbId: null
});

const result = (kind: 'tv' | 'movie', id: string, name: string): SearchResult => ({
	ref: { provider: 'tmdb', kind, id },
	href: `/title/${kind}/${id}`,
	mediaType: kind === 'tv' ? 'anime' : 'movie',
	isAnime: true,
	name,
	year: 2020,
	poster: null,
	backdrop: null,
	rating: null
});

let userId: number;

beforeAll(async () => {
	runMigrations();
	userId = await createUser({ username: 'fan', password: 'password1', role: 'user' });
	// Demon Slayer: two seasons and two movies share a TVDB id.
	getDb()
		.insert(animeMappings)
		.values([
			mapping(101922, 85937, null),
			mapping(129874, 85937, null),
			mapping(112151, null, 635302),
			mapping(178788, null, 1311031)
		])
		.run();
});

afterAll(() => {
	closeDb();
	rmSync(dataDir, { recursive: true, force: true });
});

describe('anime movies belong to their show', () => {
	it("finds a show's movies and a movie's show", () => {
		expect(franchise.animeMoviesForShow(85937)).toEqual([635302, 1311031]);
		expect(franchise.showForAnimeMovie(1311031)).toBe(85937);
		expect(franchise.showForAnimeMovie(1)).toBeNull();
	});

	it('folds movies into their show in search results, only when the show is listed', () => {
		const folded = foldAnimeMovies([
			result('tv', '85937', 'Demon Slayer'),
			result('movie', '635302', 'Mugen Train'),
			result('movie', '1311031', 'Infinity Castle')
		]);
		expect(folded.map((r) => [r.name, r.badge])).toEqual([['Demon Slayer', '+2 movies']]);

		const alone = foldAnimeMovies([result('movie', '635302', 'Mugen Train')]);
		expect(alone.map((r) => r.name)).toEqual(['Mugen Train']);
	});
});

describe('book editions', () => {
	it('maps a language search to that edition', () => {
		const doc = mapDoc({
			key: '/works/OL82563W',
			title: "Harry Potter and the Philosopher's Stone",
			cover_i: 1,
			editions: {
				docs: [
					{ key: '/books/OL19679484M', title: "Harry Potter à l'école des sorciers", cover_i: 2 }
				]
			}
		});
		expect(doc).toMatchObject({
			href: '/read/book/82563?edition=19679484',
			name: "Harry Potter à l'école des sorciers",
			originalName: "Harry Potter and the Philosopher's Stone",
			poster: { url: 'https://covers.openlibrary.org/b/id/2-L.jpg' }
		});
	});

	it("keeps the reader's edition: title, cover and page count", async () => {
		const work: TitleDetails = {
			ref: { provider: 'openlibrary', kind: 'book', id: '82563' },
			mediaType: 'book',
			isAnime: false,
			name: "Harry Potter and the Philosopher's Stone",
			originalName: null,
			tagline: null,
			overview: null,
			poster: null,
			backdrop: null,
			logo: null,
			genres: [],
			status: 'released',
			startDate: '1997-01-01',
			endDate: null,
			runtime: null,
			pages: 223,
			rating: null,
			certification: null,
			companies: ['J. K. Rowling'],
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
		const title = storeTitle('book', '82563', work, []);
		const edition: BookEdition = {
			id: '19679484',
			title: "Harry Potter à l'école des sorciers",
			cover: { url: 'https://covers.openlibrary.org/b/id/2-L.jpg' },
			pages: 232,
			language: 'fr',
			publisher: 'Gallimard',
			year: '2006'
		};
		// Seed the cached edition so no network is needed.
		getDb()
			.insert(apiCache)
			.values({
				key: 'edition:openlibrary:19679484',
				value: JSON.stringify(edition),
				expiresAt: new Date(Date.now() + 86_400_000)
			})
			.run();

		library.setStatus(userId, title.id, 'planned');
		await rememberEdition(userId, title.id, '19679484');
		tracking.setReadingProgress(userId, title, 100, {});

		const [item] = library.listLibrary(userId, {});
		expect(item).toMatchObject({
			name: "Harry Potter à l'école des sorciers",
			poster: { url: 'https://covers.openlibrary.org/b/id/2-L.jpg' },
			reading: { page: 100, pages: 232 }
		});
		// The French edition has 232 pages: page 232 finishes it, not 223.
		expect(tracking.setReadingProgress(userId, title, 223, {}).finished).toBe(false);
		expect(tracking.setReadingProgress(userId, title, 232, {}).finished).toBe(true);
		// Saving pages never loses the edition.
		expect(library.listLibrary(userId, {})[0].name).toBe("Harry Potter à l'école des sorciers");
	});
});
