import { describe, expect, it } from 'vitest';
import {
	dedupeByHref,
	episodesFrom,
	fuzzyDate,
	mapAnilistStatus,
	mapMedia,
	stripDescription,
	type RawMedia,
	type RawMediaDetails
} from '../../src/lib/server/providers/anilist';
import type { AnimeMapping } from '../../src/lib/server/providers/anime-mapping';

const media = (overrides: Partial<RawMedia> = {}): RawMedia => ({
	id: 145064,
	idMal: 51009,
	format: 'TV',
	status: 'FINISHED',
	episodes: 23,
	duration: 24,
	season: 'SUMMER',
	seasonYear: 2023,
	averageScore: 86,
	genres: ['Action'],
	title: {
		romaji: 'Jujutsu Kaisen 2nd Season',
		english: 'JUJUTSU KAISEN Season 2',
		native: '呪術廻戦',
		userPreferred: 'Jujutsu Kaisen 2nd Season'
	},
	startDate: { year: 2023, month: 7, day: 6 },
	endDate: { year: 2023, month: 12, day: 28 },
	coverImage: { extraLarge: 'https://img/xl.jpg', large: 'https://img/l.jpg', color: '#e4a15d' },
	bannerImage: 'https://img/banner.jpg',
	description: 'Second season.<br><br><i>(Source: Crunchyroll)</i>',
	nextAiringEpisode: null,
	...overrides
});

const mapping = (overrides: Partial<AnimeMapping> = {}): AnimeMapping => ({
	anilistId: 145064,
	malId: 51009,
	format: 'TV',
	tmdbTvId: 95479,
	tmdbMovieId: null,
	tmdbSeason: 2,
	tmdbEpisodeOffset: null,
	tvdbId: 377543,
	imdbId: 'tt12343534',
	...overrides
});

describe('anilist mapping', () => {
	it('links mapped anime to the TMDB show at the right season', () => {
		const result = mapMedia(media(), mapping());
		expect(result.href).toBe('/title/tv/95479?season=2');
		expect(result.ref).toEqual({ provider: 'tmdb', kind: 'tv', id: '95479' });
		expect(result.badge).toBe('Season 2');
		expect(result.mediaType).toBe('anime');
		expect(result.rating).toBe(8.6);
		expect(result.poster?.color).toBe('#e4a15d');
	});

	it('falls back to an AniList page without a mapping', () => {
		const result = mapMedia(media(), undefined);
		expect(result.href).toBe('/title/anime/145064');
		expect(result.ref.provider).toBe('anilist');
	});

	it('links anime movies to TMDB movies', () => {
		const result = mapMedia(
			media({ id: 131573, format: 'MOVIE' }),
			mapping({ tmdbTvId: null, tmdbMovieId: 810693 })
		);
		expect(result.href).toBe('/title/movie/810693');
		expect(result.mediaType).toBe('movie');
	});

	it('keeps one result per show', () => {
		const s1 = mapMedia(media({ id: 113415 }), mapping({ anilistId: 113415, tmdbSeason: 1 }));
		const s2 = mapMedia(media(), mapping());
		expect(dedupeByHref([s1, s2])).toEqual([s1]);
	});

	it('cleans descriptions and dates', () => {
		expect(stripDescription('Second season.<br><br><i>(Source: Crunchyroll)</i>')).toBe(
			'Second season.'
		);
		expect(stripDescription(null)).toBeNull();
		expect(fuzzyDate({ year: 2023, month: 7, day: null })).toBe('2023-07-01');
		expect(fuzzyDate({ year: null, month: null, day: null })).toBeNull();
		expect(mapAnilistStatus('RELEASING')).toBe('returning');
		expect(mapAnilistStatus('NOT_YET_RELEASED')).toBe('upcoming');
	});
});

describe('episodesFrom', () => {
	const details = (overrides: Partial<RawMediaDetails>): RawMediaDetails => ({
		...media(),
		studios: { nodes: [] },
		trailer: null,
		airingSchedule: { nodes: [] },
		characters: { edges: [] },
		recommendations: { nodes: [] },
		...overrides
	});
	const at = (iso: string) => Date.parse(iso) / 1000;

	it('dates unscheduled early episodes of an airing show', () => {
		const episodes = episodesFrom(
			details({
				status: 'RELEASING',
				episodes: 12,
				startDate: { year: 2026, month: 10, day: 1 },
				airingSchedule: {
					nodes: [
						{ episode: 3, airingAt: at('2026-10-08T15:00:00Z') },
						{ episode: 4, airingAt: at('2026-10-15T15:00:00Z') },
						{ episode: 5, airingAt: at('2026-10-22T15:00:00Z') }
					]
				}
			}),
			Date.parse('2026-10-20T00:00:00Z')
		);
		expect(episodes).toHaveLength(12);
		expect(episodes[0].airDate).toBe('2026-10-01');
		expect(episodes[3].airAt).toBe('2026-10-15T15:00:00.000Z');
		expect(episodes[4].airDate).toBe('2026-10-22');
		expect(episodes[5].airDate).toBeNull();
	});
});
