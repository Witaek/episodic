import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });

/** Key/value store for instance-level facts (first-run state, last job runs, …). */
export const appMeta = sqliteTable('app_meta', {
	key: text('key').primaryKey(),
	value: text('value').notNull(),
	updatedAt: timestamp('updated_at')
		.notNull()
		.$defaultFn(() => new Date())
});

/** Short-lived cache of provider responses (search, details, trending). */
export const apiCache = sqliteTable(
	'api_cache',
	{
		key: text('key').primaryKey(),
		value: text('value').notNull(),
		expiresAt: timestamp('expires_at').notNull()
	},
	(t) => [index('api_cache_expires_idx').on(t.expiresAt)]
);

/** AniList ↔ TMDB/TVDB/MAL id mapping, imported from Fribb/anime-lists. */
export const animeMappings = sqliteTable(
	'anime_mappings',
	{
		anilistId: integer('anilist_id').primaryKey(),
		malId: integer('mal_id'),
		format: text('format'),
		tmdbTvId: integer('tmdb_tv_id'),
		tmdbMovieId: integer('tmdb_movie_id'),
		tmdbSeason: integer('tmdb_season'),
		tmdbEpisodeOffset: integer('tmdb_episode_offset'),
		tvdbId: integer('tvdb_id'),
		imdbId: text('imdb_id')
	},
	(t) => [
		index('anime_mappings_tmdb_tv_idx').on(t.tmdbTvId),
		index('anime_mappings_tmdb_movie_idx').on(t.tmdbMovieId)
	]
);

/** One row per background job run, for the status panel and debugging. */
export const jobRuns = sqliteTable(
	'job_runs',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		job: text('job').notNull(),
		status: text('status', { enum: ['running', 'success', 'error'] }).notNull(),
		message: text('message'),
		startedAt: timestamp('started_at').notNull(),
		finishedAt: timestamp('finished_at')
	},
	(t) => [index('job_runs_job_idx').on(t.job, t.startedAt)]
);
