import type { Season, SearchResult, TitleDetails } from '../../src/lib/catalog/types';

/** Test-only account used by the e2e suite (fresh database each run). */
export const ADMIN = { username: 'e2e-admin', password: 'e2e-password-123' };

const DAY = 24 * 60 * 60 * 1000;
const isoDay = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

export const ANIME_ID = '900001';
export const ANIME_NAME = 'Fixture Chronicles';

const poster = {
	url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 3"%3E%3Crect width="2" height="3" fill="%238b7cff"/%3E%3C/svg%3E',
	color: '#8b7cff'
};

export const searchResults: SearchResult[] = [
	{
		ref: { provider: 'anilist', kind: 'anime', id: ANIME_ID },
		href: `/title/anime/${ANIME_ID}`,
		mediaType: 'anime',
		isAnime: true,
		name: ANIME_NAME,
		originalName: 'Fikusucha',
		year: 2026,
		overview: 'A test show.',
		poster,
		backdrop: null,
		rating: 8.4,
		badge: 'TV'
	}
];

export const title: TitleDetails = {
	ref: { provider: 'anilist', kind: 'anime', id: ANIME_ID },
	mediaType: 'anime',
	isAnime: true,
	name: ANIME_NAME,
	originalName: 'Fikusucha',
	tagline: null,
	overview: 'Three episodes exist; two have aired.',
	poster,
	backdrop: null,
	logo: null,
	genres: ['Adventure'],
	status: 'returning',
	startDate: isoDay(-14),
	endDate: null,
	runtime: 24,
	rating: 8.4,
	certification: null,
	companies: ['Test Studio'],
	cast: [],
	seasons: [{ number: 1, name: 'Episodes', episodeCount: 3, airDate: isoDay(-14), poster }],
	episodeCount: 3,
	nextEpisode: {
		id: `${ANIME_ID}-3`,
		seasonNumber: 1,
		number: 3,
		name: null,
		airDate: isoDay(3),
		airAt: null
	},
	lastEpisode: {
		id: `${ANIME_ID}-2`,
		seasonNumber: 1,
		number: 2,
		name: null,
		airDate: isoDay(-7),
		airAt: null
	},
	recommendations: [],
	trailerUrl: null,
	externalIds: { anilist: ANIME_ID },
	sourceUrl: null
};

export const season: Season = {
	number: 1,
	name: 'Episodes',
	overview: null,
	airDate: isoDay(-14),
	poster,
	episodeCount: 3,
	episodes: [-14, -7, 3].map((offset, i) => ({
		id: `${ANIME_ID}-${i + 1}`,
		seasonNumber: 1,
		number: i + 1,
		name: `Chapter ${i + 1}`,
		overview: `Episode ${i + 1} of the fixture show.`,
		airDate: isoDay(offset),
		airAt: null,
		still: null,
		runtime: 24,
		rating: null
	}))
};

/** A book series (Wikidata + Open Library), in the shape the reading service caches. */
export const SERIES_ID = '900100';
export const SERIES_NAME = 'Fixture Saga';
export const seriesBundle = {
	info: {
		qid: SERIES_ID,
		name: SERIES_NAME,
		description: 'A test series of three novels',
		authors: ['Ada Fixture'],
		members: [1, 2, 3].map((n) => ({
			qid: `90010${n}`,
			ordinal: String(n),
			label: `Saga book ${n}`,
			work: `90010${n}`,
			published: `200${n}-01-01`
		}))
	},
	volumes: [1, 2, 3].map((n) => [
		`90010${n}`,
		{ title: `Saga book ${n}`, cover: poster, pages: 300, year: 2000 + n, edition: null }
	]),
	overview: 'Three books to track like a show.',
	genres: ['Fantasy']
};
