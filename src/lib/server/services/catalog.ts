import type {
	SearchFilter,
	SearchResult,
	Season,
	TitleDetails,
	TitleKind,
	BookEdition,
	BookLanguage
} from '$lib/catalog/types';
import { titleHref } from '$lib/catalog/types';
import { cached, HOUR } from '../cache';
import { config } from '../config';
import { mappingsByAnilistIds } from '../providers/anime-mapping';
import { ProviderError } from '../providers/http';
import { showsForAnimeMovies } from './franchise';
import { anilist, openlibrary, tmdb, type LocaleOptions } from '../providers';
import { getEdition, searchBooks } from '../providers/openlibrary';

/**
 * Catalog: search, browse and title details across providers, with caching.
 * Pages and API routes talk to this service, never to providers directly.
 */

const TTL = {
	search: 6 * HOUR,
	trending: 6 * HOUR,
	title: 12 * HOUR,
	season: 12 * HOUR
};

export function defaultLocale(): LocaleOptions {
	const { METADATA_LANGUAGE, METADATA_REGION } = config();
	return { language: METADATA_LANGUAGE, region: METADATA_REGION };
}

/**
 * Anime movies shown next to their own show are folded into it ("+2 movies" on the show card).
 * A movie whose show isn't in the results stays, so searching for a movie by name still finds it.
 */
export function foldAnimeMovies(results: SearchResult[]): SearchResult[] {
	const movieIds = results
		.filter((r) => r.isAnime && r.ref.provider === 'tmdb' && r.ref.kind === 'movie')
		.map((r) => Number(r.ref.id));
	if (movieIds.length === 0) return results;
	const showOf = showsForAnimeMovies(movieIds);
	const shows = new Set(
		results
			.filter((r) => r.ref.provider === 'tmdb' && r.ref.kind === 'tv')
			.map((r) => Number(r.ref.id))
	);
	const folded = new Map<number, number>();
	const kept = results.filter((r) => {
		if (r.ref.kind !== 'movie' || r.ref.provider !== 'tmdb') return true;
		const show = showOf.get(Number(r.ref.id));
		if (show === undefined || !shows.has(show)) return true;
		folded.set(show, (folded.get(show) ?? 0) + 1);
		return false;
	});
	return kept.map((r) => {
		const n = r.ref.kind === 'tv' ? folded.get(Number(r.ref.id)) : undefined;
		if (!n) return r;
		const movies = `+${n} movie${n === 1 ? '' : 's'}`;
		return { ...r, badge: r.badge ? `${r.badge} · ${movies}` : movies };
	});
}

export interface SearchResponse {
	results: SearchResult[];
	/** Set when results are limited because TMDB isn't configured. */
	tmdbMissing: boolean;
}

export async function search(
	query: string,
	filter: SearchFilter,
	locale = defaultLocale(),
	{ bookLanguage }: { bookLanguage?: BookLanguage } = {}
): Promise<SearchResponse> {
	const q = query.trim().replace(/\s+/g, ' ');
	const tmdbReady = tmdb.isConfigured();
	if (!q) return { results: [], tmdbMissing: !tmdbReady };

	if (filter === 'book') {
		const results = await cached(
			`search:openlibrary:${bookLanguage ?? 'any'}:${q.toLowerCase()}`,
			TTL.search,
			() => searchBooks(q, bookLanguage)
		);
		return { results, tmdbMissing: false };
	}

	const key = (provider: string) =>
		`search:${provider}:${filter}:${locale.language}:${q.toLowerCase()}`;

	if (filter === 'anime' || !tmdbReady) {
		if (!tmdbReady && (filter === 'tv' || filter === 'movie'))
			return { results: [], tmdbMissing: true };
		try {
			const results = await cached(key('anilist'), TTL.search, () =>
				anilist.search(q, 'anime', locale)
			);
			return { results: tmdbReady ? foldAnimeMovies(results) : results, tmdbMissing: !tmdbReady };
		} catch (error) {
			if (!tmdbReady) throw error;
			console.warn(`[catalog] AniList search failed, using TMDB: ${String(error)}`);
		}
	}

	const results = await cached(key('tmdb'), TTL.search, () => tmdb.search(q, filter, locale));
	return { results: foldAnimeMovies(results), tmdbMissing: false };
}

export interface BrowseRow {
	id: string;
	title: string;
	results: SearchResult[];
}

/** Trending rows for the home and empty-search screens. Failing rows are left out. */
export async function trendingRows(locale = defaultLocale()): Promise<BrowseRow[]> {
	const rows: { id: string; title: string; load: () => Promise<SearchResult[]> }[] = [];
	if (tmdb.isConfigured()) {
		rows.push(
			{ id: 'tv', title: 'Trending shows', load: () => tmdb.trending('tv', locale) },
			{ id: 'movie', title: 'Trending movies', load: () => tmdb.trending('movie', locale) }
		);
	}
	rows.push({
		id: 'anime',
		title: 'Trending anime',
		load: () => anilist.trending('anime', locale)
	});

	const settled = await Promise.allSettled(
		rows.map((row) => cached(`trending:${row.id}:${locale.language}`, TTL.trending, row.load))
	);
	return rows.flatMap((row, i) => {
		const outcome = settled[i];
		if (outcome.status === 'rejected') {
			console.warn(`[catalog] trending ${row.id} failed: ${String(outcome.reason)}`);
			return [];
		}
		return outcome.value.length ? [{ id: row.id, title: row.title, results: outcome.value }] : [];
	});
}

export type TitleLookup = { redirect: string } | { title: TitleDetails };

export interface FetchOptions {
	/** Bypass the cache (background refresh, storing a title). */
	fresh?: boolean;
}

export async function getTitle(
	kind: TitleKind,
	id: string,
	locale = defaultLocale(),
	{ fresh }: FetchOptions = {}
): Promise<TitleLookup> {
	if (kind === 'book') {
		const title = await cached(
			`title:openlibrary:${id}`,
			TTL.title,
			() => openlibrary.getTitle('book', id, locale),
			{ fresh }
		);
		return { title };
	}

	if (kind === 'anime') {
		// Anime is tracked TV-style: open the TMDB show when the mapping knows it.
		const mapping = mappingsByAnilistIds([Number(id)]).get(Number(id));
		if (mapping && tmdb.isConfigured()) {
			if (mapping.tmdbTvId && mapping.format !== 'MOVIE') {
				const season = mapping.tmdbSeason && mapping.tmdbSeason > 0 ? mapping.tmdbSeason : null;
				return { redirect: titleHref({ kind: 'tv', id: String(mapping.tmdbTvId) }, season) };
			}
			if (mapping.tmdbMovieId) {
				return { redirect: titleHref({ kind: 'movie', id: String(mapping.tmdbMovieId) }) };
			}
		}
		const title = await cached(
			`title:anilist:${id}`,
			TTL.title,
			() => anilist.getTitle('anime', id, locale),
			{ fresh }
		);
		return { title };
	}

	const title = await cached(
		`title:tmdb:${kind}:${id}:${locale.language}`,
		TTL.title,
		() => tmdb.getTitle(kind, id, locale),
		{ fresh }
	);
	return { title };
}

export async function getSeason(
	kind: TitleKind,
	id: string,
	season: number,
	locale = defaultLocale(),
	{ fresh }: FetchOptions = {}
): Promise<Season> {
	if (kind === 'anime') {
		return cached(
			`season:anilist:${id}`,
			TTL.season,
			() => anilist.getSeason('anime', id, season, locale),
			{ fresh }
		);
	}
	return cached(
		`season:tmdb:${id}:${season}:${locale.language}`,
		TTL.season,
		() => tmdb.getSeason('tv', id, season, locale),
		{ fresh }
	);
}

/** A book edition (translation), cached like titles. */
export function getBookEdition(id: string, { fresh }: FetchOptions = {}): Promise<BookEdition> {
	return cached(`edition:openlibrary:${id}`, TTL.title, () => getEdition(id), { fresh });
}

/** The season to show first when none is requested. */
export function defaultSeasonNumber(title: TitleDetails): number | null {
	const numbers = title.seasons.map((s) => s.number);
	if (numbers.length === 0) return null;
	if (numbers.includes(1)) return 1;
	const regular = numbers.filter((n) => n > 0).sort((a, b) => a - b);
	return regular[0] ?? numbers[0];
}

export function isNotFound(error: unknown): boolean {
	return error instanceof ProviderError && error.status === 404;
}
