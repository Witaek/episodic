import { describe, expect, it } from 'vitest';
import {
	isAnimeItem,
	mapDetails,
	mapListItem,
	mapStatus,
	tmdbImage
} from '../../src/lib/server/providers/tmdb';

const locale = { language: 'en-US', region: 'US' };

describe('tmdb mapping', () => {
	it('builds responsive image URLs', () => {
		const image = tmdbImage('/abc.jpg', 'poster');
		expect(image?.url).toBe('https://image.tmdb.org/t/p/w342/abc.jpg');
		expect(image?.srcset).toContain('https://image.tmdb.org/t/p/w500/abc.jpg 500w');
		expect(tmdbImage(null, 'poster')).toBeNull();
	});

	it('detects anime: Japanese animation only', () => {
		expect(isAnimeItem({ genre_ids: [16], original_language: 'ja' })).toBe(true);
		expect(isAnimeItem({ genre_ids: [16], origin_country: ['JP'] })).toBe(true);
		expect(isAnimeItem({ genre_ids: [16], original_language: 'en' })).toBe(false);
		expect(isAnimeItem({ genre_ids: [18], original_language: 'ja' })).toBe(false);
	});

	it('maps multi-search items and skips people', () => {
		const show = mapListItem({
			id: 95479,
			media_type: 'tv',
			name: 'Jujutsu Kaisen',
			first_air_date: '2020-10-03',
			genre_ids: [16, 10759],
			original_language: 'ja',
			vote_average: 8.56,
			vote_count: 4000,
			poster_path: '/p.jpg'
		});
		expect(show).toMatchObject({
			href: '/title/tv/95479',
			mediaType: 'anime',
			isAnime: true,
			year: 2020,
			rating: 8.6
		});
		expect(mapListItem({ id: 1, media_type: 'person', name: 'Someone' })).toBeNull();
		expect(mapListItem({ id: 550, title: 'Fight Club' }, 'movie')?.mediaType).toBe('movie');
	});

	it('maps statuses', () => {
		expect(mapStatus('Returning Series', 'tv')).toBe('returning');
		expect(mapStatus('Ended', 'tv')).toBe('ended');
		expect(mapStatus('Canceled', 'tv')).toBe('canceled');
		expect(mapStatus('In Production', 'movie')).toBe('upcoming');
		expect(mapStatus('Released', 'movie')).toBe('released');
		expect(mapStatus(undefined, 'tv')).toBe('unknown');
	});

	it('maps TV details', () => {
		const details = mapDetails(
			{
				id: 1399,
				name: 'Game of Thrones',
				original_name: 'Game of Thrones',
				genres: [{ id: 18, name: 'Drama' }],
				status: 'Ended',
				first_air_date: '2011-04-17',
				last_air_date: '2019-05-19',
				episode_run_time: [60],
				networks: [{ name: 'HBO' }],
				number_of_episodes: 73,
				seasons: [
					{
						season_number: 0,
						name: 'Specials',
						episode_count: 10,
						air_date: null,
						poster_path: null
					},
					{
						season_number: 1,
						name: 'Season 1',
						episode_count: 10,
						air_date: '2011-04-17',
						poster_path: '/s1.jpg'
					}
				],
				last_episode_to_air: {
					id: 1,
					name: 'The Iron Throne',
					season_number: 8,
					episode_number: 6,
					air_date: '2019-05-19'
				},
				external_ids: { imdb_id: 'tt0944947', tvdb_id: 121361 },
				images: {
					logos: [
						{ file_path: '/fr.png', iso_639_1: 'fr', vote_average: 9 },
						{ file_path: '/en.png', iso_639_1: 'en', vote_average: 5 }
					]
				},
				content_ratings: { results: [{ iso_3166_1: 'US', rating: 'TV-MA' }] },
				videos: { results: [{ site: 'YouTube', type: 'Trailer', key: 'abc', official: true }] }
			},
			'tv',
			locale
		);
		expect(details).toMatchObject({
			mediaType: 'show',
			status: 'ended',
			endDate: '2019-05-19',
			runtime: 60,
			certification: 'TV-MA',
			companies: ['HBO'],
			trailerUrl: 'https://www.youtube.com/watch?v=abc',
			externalIds: { tmdb: '1399', imdb: 'tt0944947', tvdb: '121361' }
		});
		expect(details.logo?.url).toContain('/en.png');
		expect(details.seasons).toHaveLength(2);
		expect(details.lastEpisode).toMatchObject({ seasonNumber: 8, number: 6 });
	});
});
