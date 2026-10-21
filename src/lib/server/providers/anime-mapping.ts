import { eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { animeMappings, animeMovieLinks, appMeta } from '../db/schema';
import { DAY } from '../cache';
import { createHttpClient } from './http';

/**
 * AniList ↔ TMDB id mapping from https://github.com/Fribb/anime-lists.
 * It lets an AniList search result open the matching TMDB show at the right season.
 */
const SOURCE_URL =
	'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json';
const META_KEY = 'anime_mappings_updated_at';
const MAX_AGE = 7 * DAY;

const request = createHttpClient('anime-lists', { burst: 1, perSecond: 1, concurrency: 1 });

export interface RawMappingEntry {
	anilist_id?: number;
	mal_id?: number;
	type?: string;
	themoviedb_id?: { tv?: number; movie?: number | number[] };
	season?: { tmdb?: number; tvdb?: number };
	episode_offset?: { tmdb?: number; tvdb?: number };
	tvdb_id?: number;
	imdb_id?: string | string[];
}

export type AnimeMapping = typeof animeMappings.$inferSelect;

export function parseMappingEntry(entry: RawMappingEntry): AnimeMapping | null {
	if (!entry.anilist_id) return null;
	const movie = entry.themoviedb_id?.movie;
	const imdb = Array.isArray(entry.imdb_id) ? entry.imdb_id[0] : entry.imdb_id;
	return {
		anilistId: entry.anilist_id,
		malId: entry.mal_id ?? null,
		format: entry.type ?? null,
		tmdbTvId: entry.themoviedb_id?.tv ?? null,
		tmdbMovieId: (Array.isArray(movie) ? movie[0] : movie) ?? null,
		tmdbSeason: entry.season?.tmdb ?? null,
		tmdbEpisodeOffset: entry.episode_offset?.tmdb ?? null,
		tvdbId: entry.tvdb_id ?? null,
		imdbId: imdb ?? null
	};
}

export function mappingsAge(): number {
	const row = getDb().select().from(appMeta).where(eq(appMeta.key, META_KEY)).get();
	return row ? Date.now() - Number(row.value) : Infinity;
}

/** Downloads the mapping file and replaces the table. Returns the number of rows stored. */
export async function refreshAnimeMappings(): Promise<number> {
	const entries = await request<RawMappingEntry[]>(SOURCE_URL, { timeoutMs: 60_000 });
	const rows = entries.map(parseMappingEntry).filter((row): row is AnimeMapping => row !== null);
	if (rows.length < 1000) throw new Error(`Mapping file looks incomplete (${rows.length} rows)`);

	const db = getDb();
	db.transaction((tx) => {
		tx.delete(animeMappings).run();
		for (let i = 0; i < rows.length; i += 500) {
			tx.insert(animeMappings)
				.values(rows.slice(i, i + 500))
				.onConflictDoNothing()
				.run();
		}
		const now = String(Date.now());
		tx.insert(appMeta)
			.values({ key: META_KEY, value: now })
			.onConflictDoUpdate({ target: appMeta.key, set: { value: now, updatedAt: new Date() } })
			.run();
	});
	return rows.length;
}

export async function ensureAnimeMappings(): Promise<void> {
	if (mappingsAge() > MAX_AGE) await refreshAnimeMappings();
}

/** Mapping rows by AniList id; a film's TMDB movie id is filled in when found through IMDb. */
export function mappingsByAnilistIds(ids: number[]): Map<number, AnimeMapping> {
	if (ids.length === 0) return new Map();
	const rows = getDb()
		.select({ mapping: animeMappings, linkedMovie: animeMovieLinks.tmdbMovieId })
		.from(animeMappings)
		.leftJoin(animeMovieLinks, eq(animeMovieLinks.imdbId, animeMappings.imdbId))
		.where(inArray(animeMappings.anilistId, ids))
		.all();
	return new Map(
		rows.map(({ mapping, linkedMovie }) => [
			mapping.anilistId,
			{ ...mapping, tmdbMovieId: mapping.tmdbMovieId ?? linkedMovie }
		])
	);
}

export function mappingsForTmdbTv(tmdbId: number): AnimeMapping[] {
	return getDb()
		.select()
		.from(animeMappings)
		.where(eq(animeMappings.tmdbTvId, tmdbId))
		.orderBy(sql`coalesce(${animeMappings.tmdbSeason}, 999)`, animeMappings.anilistId)
		.all();
}
