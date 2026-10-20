import type {
	Image,
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
import { mappingsByAnilistIds, type AnimeMapping } from './anime-mapping';
import type { LocaleOptions, MetadataProvider } from './provider';

const API = 'https://graphql.anilist.co';

// AniList currently allows 30 requests per minute.
const request = createHttpClient('anilist', { burst: 5, perSecond: 0.45, concurrency: 2 });

const MEDIA_FIELDS = `
	id idMal format status episodes duration season seasonYear averageScore genres
	title { romaji english native userPreferred }
	startDate { year month day }
	endDate { year month day }
	coverImage { extraLarge large color }
	bannerImage
	description(asHtml: false)
	nextAiringEpisode { airingAt episode }
`;

const SEARCH_QUERY = `query ($search: String, $perPage: Int) {
	Page(perPage: $perPage) {
		media(search: $search, type: ANIME, sort: SEARCH_MATCH, isAdult: false) { ${MEDIA_FIELDS} }
	}
}`;

const TRENDING_QUERY = `query ($perPage: Int) {
	Page(perPage: $perPage) {
		media(type: ANIME, sort: TRENDING_DESC, isAdult: false) { ${MEDIA_FIELDS} }
	}
}`;

const DETAILS_QUERY = `query ($id: Int) {
	Media(id: $id, type: ANIME) {
		${MEDIA_FIELDS}
		studios(isMain: true) { nodes { name } }
		trailer { id site }
		airingSchedule(perPage: 50) { nodes { airingAt episode } }
		characters(sort: [ROLE, RELEVANCE], perPage: 12) {
			edges { role node { id name { userPreferred } image { large } } }
		}
		recommendations(sort: RATING_DESC, perPage: 12) {
			nodes { mediaRecommendation { ${MEDIA_FIELDS} } }
		}
	}
}`;

interface FuzzyDate {
	year: number | null;
	month: number | null;
	day: number | null;
}

export interface RawMedia {
	id: number;
	idMal: number | null;
	format: string | null;
	status: string | null;
	episodes: number | null;
	duration: number | null;
	season: string | null;
	seasonYear: number | null;
	averageScore: number | null;
	genres: string[];
	title: {
		romaji: string | null;
		english: string | null;
		native: string | null;
		userPreferred: string;
	};
	startDate: FuzzyDate;
	endDate: FuzzyDate;
	coverImage: { extraLarge: string | null; large: string | null; color: string | null };
	bannerImage: string | null;
	description: string | null;
	nextAiringEpisode: { airingAt: number; episode: number } | null;
}

export interface RawMediaDetails extends RawMedia {
	studios: { nodes: { name: string }[] };
	trailer: { id: string; site: string } | null;
	airingSchedule: { nodes: { airingAt: number; episode: number }[] };
	characters: {
		edges: {
			role: string;
			node: { id: number; name: { userPreferred: string }; image: { large: string | null } };
		}[];
	};
	recommendations: { nodes: { mediaRecommendation: RawMedia | null }[] };
}

async function query<T>(gql: string, variables: Record<string, unknown>): Promise<T> {
	const response = await request<{ data: T; errors?: { message: string }[] }>(API, {
		method: 'POST',
		headers: { 'content-type': 'application/json', accept: 'application/json' },
		body: JSON.stringify({ query: gql, variables })
	});
	if (response.errors?.length) throw new Error(`AniList: ${response.errors[0].message}`);
	return response.data;
}

// ---------- Mapping helpers (exported for tests) ----------

export function stripDescription(text: string | null): string | null {
	if (!text) return null;
	return (
		text
			.replace(/<br\s*\/?>/gi, '\n')
			.replace(/<[^>]+>/g, '')
			.replace(/\(Source:[^)]*\)\s*$/i, '')
			.replace(/\n{3,}/g, '\n\n')
			.trim() || null
	);
}

export function fuzzyDate(date: FuzzyDate | null | undefined): string | null {
	if (!date?.year) return null;
	const pad = (n: number | null) => String(n ?? 1).padStart(2, '0');
	return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

function cover(media: RawMedia): Image | null {
	const url = media.coverImage.extraLarge ?? media.coverImage.large;
	return url ? { url, color: media.coverImage.color } : null;
}

const FORMAT_LABELS: Record<string, string> = {
	TV: 'TV',
	TV_SHORT: 'TV short',
	MOVIE: 'Movie',
	SPECIAL: 'Special',
	OVA: 'OVA',
	ONA: 'ONA',
	MUSIC: 'Music'
};

function displayTitle(media: RawMedia): string {
	return media.title.english ?? media.title.userPreferred ?? media.title.romaji ?? 'Untitled';
}

/**
 * Turns an AniList entry into a search result. When the mapping knows the TMDB entry, the result
 * links to the TMDB show (at the right season) so anime is tracked TV-style.
 */
export function mapMedia(media: RawMedia, mapping: AnimeMapping | undefined): SearchResult {
	const isMovie = media.format === 'MOVIE';
	let ref: SearchResult['ref'];
	let href: string;
	let badge: string | null = FORMAT_LABELS[media.format ?? ''] ?? null;

	if (mapping?.tmdbTvId && !isMovie) {
		ref = { provider: 'tmdb', kind: 'tv', id: String(mapping.tmdbTvId) };
		const season = mapping.tmdbSeason && mapping.tmdbSeason > 0 ? mapping.tmdbSeason : null;
		href = titleHref(ref, season);
		if (season && season > 1) badge = `Season ${season}`;
	} else if (mapping?.tmdbMovieId && isMovie) {
		ref = { provider: 'tmdb', kind: 'movie', id: String(mapping.tmdbMovieId) };
		href = titleHref(ref);
	} else {
		ref = { provider: 'anilist', kind: 'anime', id: String(media.id) };
		href = titleHref(ref);
	}

	return {
		ref,
		href,
		mediaType: isMovie ? 'movie' : 'anime',
		isAnime: true,
		name: displayTitle(media),
		originalName: media.title.native ?? media.title.romaji,
		year: media.seasonYear ?? media.startDate.year ?? null,
		overview: stripDescription(media.description),
		poster: cover(media),
		backdrop: media.bannerImage ? { url: media.bannerImage } : null,
		rating: media.averageScore ? media.averageScore / 10 : null,
		badge
	};
}

/** Keeps the best-ranked entry per destination, so one show isn't listed once per season. */
export function dedupeByHref(results: SearchResult[]): SearchResult[] {
	const seen = new Set<string>();
	return results.filter((result) => {
		const key = `${result.ref.provider}:${result.ref.kind}:${result.ref.id}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function mapList(media: RawMedia[]): SearchResult[] {
	// TMDB links are only useful when TMDB is configured; otherwise stay on AniList pages.
	const mappings = config().TMDB_ACCESS_TOKEN
		? mappingsByAnilistIds(media.map((m) => m.id))
		: new Map<number, AnimeMapping>();
	return dedupeByHref(media.map((m) => mapMedia(m, mappings.get(m.id))));
}

export function mapAnilistStatus(status: string | null): ShowStatus {
	switch (status) {
		case 'RELEASING':
			return 'returning';
		case 'FINISHED':
			return 'ended';
		case 'NOT_YET_RELEASED':
			return 'upcoming';
		case 'CANCELLED':
			return 'canceled';
		case 'HIATUS':
			return 'returning';
		default:
			return 'unknown';
	}
}

const isoFromUnix = (seconds: number) => new Date(seconds * 1000).toISOString();

export function episodesFrom(media: RawMediaDetails, now = Date.now()): Season['episodes'] {
	const schedule = new Map(media.airingSchedule.nodes.map((n) => [n.episode, n.airingAt]));
	const count = Math.max(media.episodes ?? 0, ...schedule.keys(), 0);
	// AniList often has no schedule for early or old episodes. Treat an episode as aired when the
	// show has finished or a later episode has aired, and date it with the show's start date.
	const lastAired = Math.max(
		0,
		...[...schedule].filter(([, at]) => at * 1000 <= now).map(([episode]) => episode)
	);
	const fallbackDate = fuzzyDate(media.startDate);
	return Array.from({ length: count }, (_, i) => {
		const number = i + 1;
		const airingAt = schedule.get(number);
		const assumeAired = media.status === 'FINISHED' || number < lastAired;
		return {
			id: `${media.id}-${number}`,
			seasonNumber: 1,
			number,
			name: null,
			overview: null,
			airDate: airingAt ? isoFromUnix(airingAt).slice(0, 10) : assumeAired ? fallbackDate : null,
			airAt: airingAt ? isoFromUnix(airingAt) : null,
			still: null,
			runtime: media.duration,
			rating: null
		};
	});
}

export function mapAnilistDetails(media: RawMediaDetails): TitleDetails {
	const ref = { provider: 'anilist' as const, kind: 'anime' as const, id: String(media.id) };
	const episodes = episodesFrom(media);
	const next = media.nextAiringEpisode;
	const lastAired = [...media.airingSchedule.nodes]
		.filter((n) => n.airingAt * 1000 <= Date.now())
		.sort((a, b) => b.episode - a.episode)[0];

	return {
		ref,
		mediaType: media.format === 'MOVIE' ? 'movie' : 'anime',
		isAnime: true,
		name: displayTitle(media),
		originalName: media.title.native ?? media.title.romaji,
		tagline: null,
		overview: stripDescription(media.description),
		poster: cover(media),
		backdrop: media.bannerImage ? { url: media.bannerImage } : null,
		logo: null,
		genres: media.genres,
		status: mapAnilistStatus(media.status),
		startDate: fuzzyDate(media.startDate),
		endDate: fuzzyDate(media.endDate),
		runtime: media.duration,
		rating: media.averageScore ? media.averageScore / 10 : null,
		certification: null,
		companies: media.studios.nodes.map((s) => s.name),
		cast: media.characters.edges.map((edge) => ({
			id: String(edge.node.id),
			name: edge.node.name.userPreferred,
			role: edge.role === 'MAIN' ? 'Main' : 'Supporting',
			photo: edge.node.image.large ? { url: edge.node.image.large } : null
		})),
		seasons:
			episodes.length > 0
				? [
						{
							number: 1,
							name: 'Episodes',
							episodeCount: episodes.length,
							airDate: fuzzyDate(media.startDate),
							poster: cover(media)
						}
					]
				: [],
		episodeCount: media.episodes,
		nextEpisode: next
			? {
					id: `${media.id}-${next.episode}`,
					seasonNumber: 1,
					number: next.episode,
					name: null,
					airDate: isoFromUnix(next.airingAt).slice(0, 10),
					airAt: isoFromUnix(next.airingAt)
				}
			: null,
		lastEpisode: lastAired
			? {
					id: `${media.id}-${lastAired.episode}`,
					seasonNumber: 1,
					number: lastAired.episode,
					name: null,
					airDate: isoFromUnix(lastAired.airingAt).slice(0, 10),
					airAt: isoFromUnix(lastAired.airingAt)
				}
			: null,
		recommendations: mapList(
			media.recommendations.nodes
				.map((n) => n.mediaRecommendation)
				.filter((m): m is RawMedia => m !== null)
		),
		trailerUrl:
			media.trailer?.site === 'youtube'
				? `https://www.youtube.com/watch?v=${media.trailer.id}`
				: null,
		externalIds: { anilist: String(media.id), mal: media.idMal ? String(media.idMal) : undefined },
		sourceUrl: `https://anilist.co/anime/${media.id}`
	};
}

// The title page loads details and the episode list together; share one request between them.
const recent = new Map<string, { at: number; promise: Promise<RawMediaDetails> }>();

function getDetails(id: string): Promise<RawMediaDetails> {
	const hit = recent.get(id);
	if (hit && Date.now() - hit.at < 60_000) return hit.promise;
	const promise = query<{ Media: RawMediaDetails }>(DETAILS_QUERY, { id: Number(id) }).then(
		(d) => d.Media
	);
	promise.catch(() => recent.delete(id));
	recent.set(id, { at: Date.now(), promise });
	if (recent.size > 50) recent.delete(recent.keys().next().value!);
	return promise;
}

// ---------- Provider ----------

export const anilist = {
	id: 'anilist',
	name: 'AniList',
	url: 'https://anilist.co',
	searchFilters: ['anime'],
	titleKinds: ['anime'],

	isConfigured: () => true,

	async search(search: string, _filter: SearchFilter, _locale: LocaleOptions) {
		const data = await query<{ Page: { media: RawMedia[] } }>(SEARCH_QUERY, {
			search,
			perPage: 30
		});
		return mapList(data.Page.media);
	},

	async trending(_filter: SearchFilter, _locale: LocaleOptions) {
		const data = await query<{ Page: { media: RawMedia[] } }>(TRENDING_QUERY, { perPage: 24 });
		return mapList(data.Page.media);
	},

	async getTitle(kind: TitleKind, id: string, _locale: LocaleOptions) {
		if (kind !== 'anime') throw new Error(`AniList cannot load ${kind}`);
		return mapAnilistDetails(await getDetails(id));
	},

	async getSeason(kind: TitleKind, id: string, _season: number, _locale: LocaleOptions) {
		if (kind !== 'anime') throw new Error(`AniList cannot load ${kind}`);
		const media = await getDetails(id);
		const episodes = episodesFrom(media);
		return {
			number: 1,
			name: 'Episodes',
			overview: null,
			airDate: fuzzyDate(media.startDate),
			poster: cover(media),
			episodeCount: episodes.length,
			episodes
		};
	}
} satisfies MetadataProvider;
