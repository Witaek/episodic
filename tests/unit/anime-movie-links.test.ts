import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const dataDir = mkdtempSync(join(tmpdir(), 'episodic-test-'));
process.env.DATA_DIR = dataDir;
process.env.TMDB_ACCESS_TOKEN = 'test-token';

// TMDB /find: the Naruto Shippuden films by IMDb id; the show's own IMDb id is a TV result.
const FILMS: Record<string, number> = { tt0988982: 13980, tt1160524: 19511, tt2290828: 172390 };
const lookups: string[] = [];
vi.stubGlobal('fetch', async (input: string | URL) => {
	const url = new URL(String(input));
	const imdb = url.pathname.split('/').pop()!;
	lookups.push(imdb);
	const movie = FILMS[imdb];
	return new Response(
		JSON.stringify({ movie_results: movie ? [{ id: movie }] : [], tv_results: [] }),
		{ headers: { 'content-type': 'application/json' } }
	);
});

const { runMigrations, closeDb, getDb } = await import('../../src/lib/server/db/client');
const { animeMappings } = await import('../../src/lib/server/db/schema');
const franchise = await import('../../src/lib/server/services/franchise');
const { mappingsByAnilistIds } = await import('../../src/lib/server/providers/anime-mapping');

// As in the mapping file: films listed as specials (season 0) of the show, with only an IMDb id.
const row = (anilistId: number, format: string, imdbId: string) => ({
	anilistId,
	malId: anilistId,
	format,
	tmdbTvId: 31910,
	tmdbMovieId: null,
	tmdbSeason: format === 'TV' ? null : 0,
	tmdbEpisodeOffset: null,
	tvdbId: 79824,
	imdbId
});

beforeAll(() => {
	runMigrations();
	getDb()
		.insert(animeMappings)
		.values([
			row(1735, 'TV', 'tt0988824'),
			row(2472, 'MOVIE', 'tt0988982'),
			row(4437, 'MOVIE', 'tt1160524'),
			row(13667, 'MOVIE', 'tt2290828'),
			// A short listed under the show's own IMDb id: not a separate film on TMDB.
			row(10659, 'MOVIE', 'tt0988824')
		])
		.run();
});

afterAll(() => {
	closeDb();
	rmSync(dataDir, { recursive: true, force: true });
	vi.unstubAllGlobals();
});

describe('anime films known only by IMDb id (Naruto Shippuden)', () => {
	it('are not grouped before their TMDB ids are found', () => {
		expect(franchise.animeMoviesForShow(31910)).toEqual([]);
	});

	it('are grouped with their show once found', async () => {
		await franchise.resolveShowMovies(31910);
		expect(franchise.animeMoviesForShow(31910)).toEqual([13980, 19511, 172390]);
		expect(franchise.showForAnimeMovie(19511)).toBe(31910);
		// AniList results for a film now open the movie, not the show's specials.
		expect(mappingsByAnilistIds([4437]).get(4437)?.tmdbMovieId).toBe(19511);
	});

	it('are looked up once (misses are retried only much later)', async () => {
		const before = lookups.length;
		expect(await franchise.resolveAnimeMovies()).toContain('linked 0 of 0');
		await franchise.resolveShowMovies(31910);
		expect(lookups.length).toBe(before);
	});
});
