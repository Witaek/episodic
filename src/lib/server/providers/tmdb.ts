import type {
	EpisodeSummary,
	Image,
	Person,
	SearchFilter,
	SearchResult,
	Season,
	ShowStatus,
	TitleDetails,
	TitleKind
} from '$lib/catalog/types';
import { titleHref } from '$lib/catalog/types';
import { config } from '../config';
import { createHttpClient } from './http';
import { NotConfiguredError, type LocaleOptions, type MetadataProvider } from './provider';

const API = 'https://api.themoviedb.org/3';
const IMAGES = 'https://image.tmdb.org/t/p';
const ANIMATION_GENRE = 16;

// TMDB allows roughly 40 requests per second; stay well below.
const request = createHttpClient('tmdb', { burst: 20, perSecond: 20, concurrency: 8 });

type ImageKind = 'poster' | 'backdrop' | 'profile' | 'still' | 'logo';

const SIZES: Record<ImageKind, { default: string; srcset: [string, number][] }> = {
	poster: {
		default: 'w342',
		srcset: [
			['w185', 185],
			['w342', 342],
			['w500', 500],
			['w780', 780]
		]
	},
	backdrop: {
		default: 'w1280',
		srcset: [
			['w300', 300],
			['w780', 780],
			// No 'original': TMDB originals can be 4K and several MB.
			['w1280', 1280]
		]
	},
	profile: {
		default: 'w185',
		srcset: [
			['w185', 185],
			['h632', 632]
		]
	},
	still: {
		default: 'w300',
		// Episode thumbnails are small; w300 is plenty even on 3x screens.
		srcset: [
			['w185', 185],
			['w300', 300]
		]
	},
	logo: {
		default: 'w500',
		srcset: [
			['w300', 300],
			['w500', 500]
		]
	}
};

export function tmdbImage(path: string | null | undefined, kind: ImageKind): Image | null {
	if (!path) return null;
	const sizes = SIZES[kind];
	return {
		url: `${IMAGES}/${sizes.default}${path}`,
		srcset: sizes.srcset.map(([size, width]) => `${IMAGES}/${size}${path} ${width}w`).join(', ')
	};
}

// ---------- Raw TMDB shapes (only the fields we use) ----------

interface RawListItem {
	id: number;
	media_type?: 'movie' | 'tv' | 'person';
	name?: string;
	title?: string;
	original_name?: string;
	original_title?: string;
	first_air_date?: string;
	release_date?: string;
	overview?: string;
	poster_path?: string | null;
	backdrop_path?: string | null;
	vote_average?: number;
	vote_count?: number;
	genre_ids?: number[];
	original_language?: string;
	origin_country?: string[];
}

interface RawEpisode {
	id: number;
	name: string;
	overview?: string;
	season_number: number;
	episode_number: number;
	air_date: string | null;
	still_path?: string | null;
	runtime?: number | null;
	vote_average?: number;
}

interface RawDetails extends RawListItem {
	tagline?: string;
	genres?: { id: number; name: string }[];
	status?: string;
	last_air_date?: string | null;
	runtime?: number | null;
	episode_run_time?: number[];
	networks?: { name: string }[];
	production_companies?: { name: string }[];
	number_of_episodes?: number;
	seasons?: {
		season_number: number;
		name: string;
		episode_count: number;
		air_date: string | null;
		poster_path: string | null;
	}[];
	next_episode_to_air?: RawEpisode | null;
	last_episode_to_air?: RawEpisode | null;
	imdb_id?: string | null;
	credits?: {
		cast?: { id: number; name: string; character?: string; profile_path?: string | null }[];
	};
	recommendations?: { results: RawListItem[] };
	external_ids?: { imdb_id?: string | null; tvdb_id?: number | null };
	images?: { logos?: { file_path: string; iso_639_1: string | null; vote_average: number }[] };
	content_ratings?: { results: { iso_3166_1: string; rating: string }[] };
	release_dates?: { results: { iso_3166_1: string; release_dates: { certification: string }[] }[] };
	videos?: { results: { site: string; type: string; key: string; official?: boolean }[] };
}

interface RawSeason {
	season_number: number;
	name: string;
	overview?: string;
	air_date: string | null;
	poster_path: string | null;
	episodes: RawEpisode[];
}

// ---------- Mapping helpers (exported for tests) ----------

export function isAnimeItem(
	item: Pick<RawListItem, 'genre_ids' | 'original_language' | 'origin_country'>
): boolean {
	const animated = item.genre_ids?.includes(ANIMATION_GENRE) ?? false;
	return (
		animated && (item.original_language === 'ja' || (item.origin_country ?? []).includes('JP'))
	);
}

const yearOf = (date?: string | null) => (date ? Number(date.slice(0, 4)) || null : null);
const score = (value?: number, votes?: number) =>
	value && (votes === undefined || votes > 0) ? Math.round(value * 10) / 10 : null;

export function mapListItem(item: RawListItem, fallbackType?: 'movie' | 'tv'): SearchResult | null {
	const type = item.media_type ?? fallbackType;
	if (type !== 'movie' && type !== 'tv') return null;
	const isAnime = isAnimeItem(item);
	const ref = { provider: 'tmdb' as const, kind: type, id: String(item.id) };
	return {
		ref,
		href: titleHref(ref),
		mediaType: type === 'movie' ? 'movie' : isAnime ? 'anime' : 'show',
		isAnime,
		name: item.name ?? item.title ?? 'Untitled',
		originalName: item.original_name ?? item.original_title ?? null,
		year: yearOf(item.first_air_date ?? item.release_date),
		overview: item.overview || null,
		poster: tmdbImage(item.poster_path, 'poster'),
		backdrop: tmdbImage(item.backdrop_path, 'backdrop'),
		rating: score(item.vote_average, item.vote_count),
		badge: type === 'movie' && isAnime ? 'Movie' : null
	};
}

export function mapStatus(status: string | undefined, kind: 'movie' | 'tv'): ShowStatus {
	switch (status) {
		case 'Returning Series':
			return 'returning';
		case 'In Production':
		case 'Post Production':
			return kind === 'movie' ? 'upcoming' : 'in_production';
		case 'Planned':
		case 'Pilot':
		case 'Rumored':
			return kind === 'movie' ? 'upcoming' : 'planned';
		case 'Ended':
			return 'ended';
		case 'Canceled':
			return 'canceled';
		case 'Released':
			return 'released';
		default:
			return 'unknown';
	}
}

function mapEpisodeSummary(episode: RawEpisode | null | undefined): EpisodeSummary | null {
	if (!episode) return null;
	return {
		id: String(episode.id),
		seasonNumber: episode.season_number,
		number: episode.episode_number,
		name: episode.name || null,
		airDate: episode.air_date || null
	};
}

function pickLogo(raw: RawDetails, language: string): Image | null {
	const logos = raw.images?.logos ?? [];
	const lang = language.slice(0, 2);
	const best =
		logos.find((l) => l.iso_639_1 === lang) ??
		logos.find((l) => l.iso_639_1 === 'en') ??
		logos.find((l) => l.iso_639_1 === null);
	return tmdbImage(best?.file_path, 'logo');
}

function pickCertification(raw: RawDetails, region: string): string | null {
	const tv = raw.content_ratings?.results;
	if (tv) {
		return (
			(tv.find((r) => r.iso_3166_1 === region) ?? tv.find((r) => r.iso_3166_1 === 'US'))?.rating ||
			null
		);
	}
	const movie = raw.release_dates?.results;
	if (movie) {
		const entry =
			movie.find((r) => r.iso_3166_1 === region) ?? movie.find((r) => r.iso_3166_1 === 'US');
		return entry?.release_dates.find((d) => d.certification)?.certification || null;
	}
	return null;
}

function pickTrailer(raw: RawDetails): string | null {
	const videos = raw.videos?.results.filter((v) => v.site === 'YouTube') ?? [];
	const trailer =
		videos.find((v) => v.type === 'Trailer' && v.official) ??
		videos.find((v) => v.type === 'Trailer') ??
		videos.find((v) => v.type === 'Teaser');
	return trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;
}

export function mapDetails(
	raw: RawDetails,
	kind: 'movie' | 'tv',
	locale: LocaleOptions
): TitleDetails {
	const genreIds = raw.genres?.map((g) => g.id) ?? [];
	const isAnime = isAnimeItem({ ...raw, genre_ids: genreIds });
	const ref = { provider: 'tmdb' as const, kind, id: String(raw.id) };
	const cast: Person[] = (raw.credits?.cast ?? []).slice(0, 20).map((c) => ({
		id: String(c.id),
		name: c.name,
		role: c.character || null,
		photo: tmdbImage(c.profile_path, 'profile')
	}));

	return {
		ref,
		mediaType: kind === 'movie' ? 'movie' : isAnime ? 'anime' : 'show',
		isAnime,
		name: raw.name ?? raw.title ?? 'Untitled',
		originalName: raw.original_name ?? raw.original_title ?? null,
		tagline: raw.tagline || null,
		overview: raw.overview || null,
		poster: tmdbImage(raw.poster_path, 'poster'),
		backdrop: tmdbImage(raw.backdrop_path, 'backdrop'),
		logo: pickLogo(raw, locale.language),
		genres: raw.genres?.map((g) => g.name) ?? [],
		status: mapStatus(raw.status, kind),
		startDate: raw.first_air_date || raw.release_date || null,
		endDate:
			kind === 'tv' && (raw.status === 'Ended' || raw.status === 'Canceled')
				? (raw.last_air_date ?? null)
				: null,
		runtime: raw.runtime ?? raw.episode_run_time?.[0] ?? null,
		rating: score(raw.vote_average, raw.vote_count),
		certification: pickCertification(raw, locale.region),
		companies: (raw.networks ?? raw.production_companies ?? []).map((c) => c.name).slice(0, 4),
		cast,
		seasons: (raw.seasons ?? []).map((s) => ({
			number: s.season_number,
			name: s.name,
			episodeCount: s.episode_count,
			airDate: s.air_date,
			poster: tmdbImage(s.poster_path, 'poster')
		})),
		episodeCount: raw.number_of_episodes ?? null,
		nextEpisode: mapEpisodeSummary(raw.next_episode_to_air),
		lastEpisode: mapEpisodeSummary(raw.last_episode_to_air),
		recommendations: (raw.recommendations?.results ?? [])
			.map((item) => mapListItem(item, kind))
			.filter((item): item is SearchResult => item !== null)
			.slice(0, 18),
		trailerUrl: pickTrailer(raw),
		externalIds: {
			tmdb: String(raw.id),
			imdb: raw.external_ids?.imdb_id ?? raw.imdb_id ?? undefined,
			tvdb: raw.external_ids?.tvdb_id ? String(raw.external_ids.tvdb_id) : undefined
		},
		sourceUrl: `https://www.themoviedb.org/${kind}/${raw.id}`
	};
}

export function mapSeason(raw: RawSeason): Season {
	return {
		number: raw.season_number,
		name: raw.name,
		overview: raw.overview || null,
		airDate: raw.air_date,
		poster: tmdbImage(raw.poster_path, 'poster'),
		episodeCount: raw.episodes.length,
		episodes: raw.episodes.map((e) => ({
			id: String(e.id),
			seasonNumber: e.season_number,
			number: e.episode_number,
			name: e.name || null,
			overview: e.overview || null,
			airDate: e.air_date || null,
			still: tmdbImage(e.still_path, 'still'),
			runtime: e.runtime ?? null,
			rating: score(e.vote_average)
		}))
	};
}

// ---------- Provider ----------

function get<T>(path: string, params: Record<string, string | number | boolean>): Promise<T> {
	const token = config().TMDB_ACCESS_TOKEN;
	if (!token) throw new NotConfiguredError('tmdb');
	const url = new URL(API + path);
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
	return request<T>(url.toString(), {
		headers: { authorization: `Bearer ${token}`, accept: 'application/json' }
	});
}

const SEARCH_PATHS: Record<Exclude<SearchFilter, 'anime' | 'book'>, string> = {
	all: '/search/multi',
	tv: '/search/tv',
	movie: '/search/movie'
};

export const tmdb = {
	id: 'tmdb',
	name: 'TMDB',
	url: 'https://www.themoviedb.org',
	searchFilters: ['all', 'tv', 'movie', 'anime'],
	titleKinds: ['movie', 'tv'],

	isConfigured: () => Boolean(config().TMDB_ACCESS_TOKEN),

	async search(query: string, filter: SearchFilter, locale: LocaleOptions) {
		const path = SEARCH_PATHS[filter === 'anime' || filter === 'book' ? 'tv' : filter];
		const data = await get<{ results: RawListItem[] }>(path, {
			query,
			language: locale.language,
			include_adult: false
		});
		const fallback = filter === 'movie' ? 'movie' : filter === 'all' ? undefined : 'tv';
		const results = data.results
			.map((item) => mapListItem(item, fallback))
			.filter((item): item is SearchResult => item !== null);
		return filter === 'anime' ? results.filter((r) => r.isAnime) : results;
	},

	async trending(filter: SearchFilter, locale: LocaleOptions) {
		const type = filter === 'movie' ? 'movie' : filter === 'tv' ? 'tv' : 'all';
		const data = await get<{ results: RawListItem[] }>(`/trending/${type}/week`, {
			language: locale.language
		});
		return data.results
			.map((item) => mapListItem(item, type === 'all' ? undefined : type))
			.filter((item): item is SearchResult => item !== null);
	},

	async getTitle(kind: TitleKind, id: string, locale: LocaleOptions) {
		if (kind !== 'movie' && kind !== 'tv') throw new Error(`TMDB cannot load ${kind}`);
		const extras =
			kind === 'tv'
				? 'credits,recommendations,external_ids,images,content_ratings,videos'
				: 'credits,recommendations,external_ids,images,release_dates,videos';
		const lang = locale.language.slice(0, 2);
		const raw = await get<RawDetails>(`/${kind}/${encodeURIComponent(id)}`, {
			language: locale.language,
			append_to_response: extras,
			include_image_language: [...new Set([lang, 'en', 'null'])].join(',')
		});
		return mapDetails(raw, kind, locale);
	},

	async getSeason(kind: TitleKind, id: string, season: number, locale: LocaleOptions) {
		if (kind !== 'tv') throw new Error('Only TV shows have seasons');
		const raw = await get<RawSeason>(`/tv/${encodeURIComponent(id)}/season/${season}`, {
			language: locale.language
		});
		return mapSeason(raw);
	}
} satisfies MetadataProvider;
