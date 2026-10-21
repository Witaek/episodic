import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { animeMappings, animeMovieLinks } from '../db/schema';
import { tmdb } from '../providers';
import { tmdbMovieForImdb } from '../providers/tmdb';

/**
 * Anime movies belong with their show (Demon Slayer: Mugen Train goes with Demon Slayer). The
 * anime id mapping links a franchise's entries to the TMDB show (directly, or through a shared
 * TVDB id). Many films, like Naruto's, are listed there as specials of their show with only an
 * IMDb id: their TMDB movie id is looked up once and kept in `anime_movie_links`.
 */

/** A mapping row's TMDB movie id, from the mapping file or found through its IMDb id. */
const movieId = sql<
	number | null
>`coalesce(${animeMappings.tmdbMovieId}, ${animeMovieLinks.tmdbMovieId})`;

function franchiseRows() {
	return getDb()
		.select({
			anilistId: animeMappings.anilistId,
			tvId: animeMappings.tmdbTvId,
			tvdbId: animeMappings.tvdbId,
			movie: movieId
		})
		.from(animeMappings)
		.leftJoin(animeMovieLinks, eq(animeMovieLinks.imdbId, animeMappings.imdbId));
}

/** TMDB movie ids that belong to an anime show, oldest AniList entry first. */
export function animeMoviesForShow(tmdbTvId: number): number[] {
	const db = getDb();
	const tvdbIds = db
		.selectDistinct({ tvdbId: animeMappings.tvdbId })
		.from(animeMappings)
		.where(and(eq(animeMappings.tmdbTvId, tmdbTvId), sql`${animeMappings.tvdbId} is not null`))
		.all()
		.map((r) => r.tvdbId!);
	const rows = franchiseRows()
		.where(
			and(
				sql`${movieId} is not null`,
				tvdbIds.length
					? or(eq(animeMappings.tmdbTvId, tmdbTvId), inArray(animeMappings.tvdbId, tvdbIds))
					: eq(animeMappings.tmdbTvId, tmdbTvId)
			)
		)
		.orderBy(animeMappings.anilistId)
		.all();
	return [...new Set(rows.map((r) => r.movie!))];
}

/** The TMDB show an anime movie belongs to, if any. */
export function showForAnimeMovie(tmdbMovieId: number): number | null {
	return showsForAnimeMovies([tmdbMovieId]).get(tmdbMovieId) ?? null;
}

/** For many movies at once: TMDB movie id → TMDB show id. */
export function showsForAnimeMovies(tmdbMovieIds: number[]): Map<number, number> {
	const result = new Map<number, number>();
	if (tmdbMovieIds.length === 0) return result;
	const movies = franchiseRows()
		.where(
			or(
				inArray(animeMappings.tmdbMovieId, tmdbMovieIds),
				inArray(animeMovieLinks.tmdbMovieId, tmdbMovieIds)
			)
		)
		.all();
	if (movies.length === 0) return result;

	// A film listed as a special already names its show; others go through the TVDB id.
	const tvdbIds = [...new Set(movies.map((m) => m.tvdbId).filter((id): id is number => !!id))];
	const showByTvdb = new Map<number, number>();
	if (tvdbIds.length) {
		for (const s of getDb()
			.select({ tv: animeMappings.tmdbTvId, tvdbId: animeMappings.tvdbId })
			.from(animeMappings)
			.where(
				and(inArray(animeMappings.tvdbId, tvdbIds), sql`${animeMappings.tmdbTvId} is not null`)
			)
			.all()) {
			if (!showByTvdb.has(s.tvdbId!)) showByTvdb.set(s.tvdbId!, s.tv!);
		}
	}
	for (const { movie, tvId, tvdbId } of movies) {
		const show = tvId ?? (tvdbId ? showByTvdb.get(tvdbId) : undefined);
		if (movie && show && !result.has(movie)) result.set(movie, show);
	}
	return result;
}

/** Look a missing id up again after this long (TMDB may have added the film). */
const RECHECK_MS = 30 * 24 * 60 * 60 * 1000;

/** IMDb ids of anime films with no TMDB movie id yet (optionally only one show's franchise). */
function unresolvedImdbIds(tmdbTvId?: number): string[] {
	const db = getDb();
	const rows = db
		.selectDistinct({ imdb: animeMappings.imdbId })
		.from(animeMappings)
		.leftJoin(animeMovieLinks, eq(animeMovieLinks.imdbId, animeMappings.imdbId))
		.where(
			and(
				eq(animeMappings.format, 'MOVIE'),
				isNull(animeMappings.tmdbMovieId),
				sql`${animeMappings.imdbId} is not null`,
				tmdbTvId === undefined ? undefined : eq(animeMappings.tmdbTvId, tmdbTvId),
				or(
					isNull(animeMovieLinks.imdbId),
					and(
						isNull(animeMovieLinks.tmdbMovieId),
						lt(animeMovieLinks.checkedAt, new Date(Date.now() - RECHECK_MS))
					)
				)
			)
		)
		.all();
	return rows.map((r) => r.imdb!);
}

async function resolve(imdbIds: string[]): Promise<number> {
	let found = 0;
	for (const imdbId of imdbIds) {
		const tmdbMovieId = await tmdbMovieForImdb(imdbId);
		if (tmdbMovieId) found++;
		getDb()
			.insert(animeMovieLinks)
			.values({ imdbId, tmdbMovieId, checkedAt: new Date() })
			.onConflictDoUpdate({
				target: animeMovieLinks.imdbId,
				set: { tmdbMovieId, checkedAt: new Date() }
			})
			.run();
	}
	return found;
}

/** Before showing a show's movies: look up any of its films not resolved yet. */
export async function resolveShowMovies(tmdbTvId: number): Promise<void> {
	if (!tmdb.isConfigured()) return;
	await resolve(unresolvedImdbIds(tmdbTvId).slice(0, 30)).catch((error) =>
		console.warn(`[franchise] resolving movies of ${tmdbTvId}: ${String(error)}`)
	);
}

/** Background job: find TMDB ids for anime films the mapping file lists only by IMDb id. */
export async function resolveAnimeMovies(limit = 600): Promise<string> {
	if (!tmdb.isConfigured()) return 'TMDB is not configured';
	const pending = unresolvedImdbIds();
	const found = await resolve(pending.slice(0, limit));
	return `linked ${found} of ${Math.min(pending.length, limit)} anime films (${Math.max(pending.length - limit, 0)} left)`;
}
