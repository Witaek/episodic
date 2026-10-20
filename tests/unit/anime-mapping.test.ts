import { describe, expect, it } from 'vitest';
import { parseMappingEntry } from '../../src/lib/server/providers/anime-mapping';

describe('parseMappingEntry', () => {
	it('parses a TV entry with a TMDB season', () => {
		expect(
			parseMappingEntry({
				type: 'TV',
				anilist_id: 145064,
				mal_id: 51009,
				imdb_id: ['tt12343534'],
				themoviedb_id: { tv: 95479 },
				tvdb_id: 377543,
				season: { tvdb: 2, tmdb: 2 }
			})
		).toEqual({
			anilistId: 145064,
			malId: 51009,
			format: 'TV',
			tmdbTvId: 95479,
			tmdbMovieId: null,
			tmdbSeason: 2,
			tmdbEpisodeOffset: null,
			tvdbId: 377543,
			imdbId: 'tt12343534'
		});
	});

	it('takes the first TMDB movie id', () => {
		expect(
			parseMappingEntry({ anilist_id: 1, type: 'MOVIE', themoviedb_id: { movie: [42, 43] } })
				?.tmdbMovieId
		).toBe(42);
	});

	it('skips entries without an AniList id', () => {
		expect(parseMappingEntry({ mal_id: 5 })).toBeNull();
	});
});
