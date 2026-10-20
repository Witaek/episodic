import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { getDb } from '../db/client';
import { animeMappings } from '../db/schema';

/**
 * Anime movies belong with their show (Demon Slayer: Mugen Train goes with Demon Slayer). The
 * anime id mapping gives every entry of a franchise the same TVDB id, which links TMDB movies to
 * the TMDB show.
 */

/** TMDB movie ids that belong to an anime show, oldest AniList entry first. */
export function animeMoviesForShow(tmdbTvId: number): number[] {
	const db = getDb();
	const tvdbIds = db
		.selectDistinct({ tvdbId: animeMappings.tvdbId })
		.from(animeMappings)
		.where(and(eq(animeMappings.tmdbTvId, tmdbTvId), isNotNull(animeMappings.tvdbId)))
		.all()
		.map((r) => r.tvdbId!);
	if (tvdbIds.length === 0) return [];
	const rows = db
		.select({ movie: animeMappings.tmdbMovieId })
		.from(animeMappings)
		.where(and(inArray(animeMappings.tvdbId, tvdbIds), isNotNull(animeMappings.tmdbMovieId)))
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
	const db = getDb();
	const movies = db
		.select({ movie: animeMappings.tmdbMovieId, tvdbId: animeMappings.tvdbId })
		.from(animeMappings)
		.where(and(inArray(animeMappings.tmdbMovieId, tmdbMovieIds), isNotNull(animeMappings.tvdbId)))
		.all();
	if (movies.length === 0) return result;
	const shows = db
		.select({ tv: animeMappings.tmdbTvId, tvdbId: animeMappings.tvdbId })
		.from(animeMappings)
		.where(
			and(
				inArray(
					animeMappings.tvdbId,
					movies.map((m) => m.tvdbId!)
				),
				isNotNull(animeMappings.tmdbTvId)
			)
		)
		.all();
	const showByTvdb = new Map(shows.map((s) => [s.tvdbId!, s.tv!]));
	for (const { movie, tvdbId } of movies) {
		const show = showByTvdb.get(tvdbId!);
		if (show && !result.has(movie!)) result.set(movie!, show);
	}
	return result;
}
