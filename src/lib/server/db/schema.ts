import {
	index,
	integer,
	primaryKey,
	real,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';
import type { Image, MediaTypeId, ProviderId, ShowStatus, TitleKind } from '$lib/catalog/types';
import type { LibraryStatus } from '$lib/media-types/types';

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

/**
 * TMDB movie ids for anime movies the mapping file only knows by IMDb id (it lists many films,
 * like Naruto's, as specials of their show). Keyed by IMDb id so it survives mapping refreshes;
 * a null movie id means TMDB has no match (checked again later).
 */
export const animeMovieLinks = sqliteTable('anime_movie_links', {
	imdbId: text('imdb_id').primaryKey(),
	tmdbMovieId: integer('tmdb_movie_id'),
	checkedAt: timestamp('checked_at').notNull()
});

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

// ---------- Accounts ----------

export interface UserPrefs {
	/** Count specials (season 0) in progress and Up Next. */
	includeSpecials?: boolean;
	/** Move titles between statuses automatically (default on). */
	autoStatus?: boolean;
	/** Also notify for shows on the watchlist, not only ones being watched. */
	notifyWatchlist?: boolean;
	/** Language last used for book search ('en' | 'fr'). */
	bookLanguage?: string;
	/** Yearly reading goal: number of books. */
	readingGoal?: { year: number; books: number };
}

export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	/** Stored lowercase. */
	username: text('username').notNull().unique(),
	displayName: text('display_name').notNull(),
	passwordHash: text('password_hash').notNull(),
	role: text('role', { enum: ['admin', 'user'] })
		.notNull()
		.default('user'),
	disabled: integer('disabled', { mode: 'boolean' }).notNull().default(false),
	prefs: text('prefs', { mode: 'json' }).$type<UserPrefs>().notNull().default({}),
	/** Secret for the iCal feed URL (calendar apps can't sign in). Null = feed off. */
	calendarToken: text('calendar_token').unique(),
	createdAt: timestamp('created_at')
		.notNull()
		.$defaultFn(() => new Date())
});

export const sessions = sqliteTable(
	'sessions',
	{
		/** SHA-256 of the cookie token; the token itself is never stored. */
		id: text('id').primaryKey(),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: timestamp('expires_at').notNull(),
		createdAt: timestamp('created_at')
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [index('sessions_user_idx').on(t.userId)]
);

// ---------- Stored metadata (titles someone has in their library or history) ----------

export const titles = sqliteTable(
	'titles',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		provider: text('provider').$type<ProviderId>().notNull(),
		kind: text('kind').$type<TitleKind>().notNull(),
		externalId: text('external_id').notNull(),
		mediaType: text('media_type').$type<MediaTypeId>().notNull(),
		isAnime: integer('is_anime', { mode: 'boolean' }).notNull().default(false),
		name: text('name').notNull(),
		originalName: text('original_name'),
		overview: text('overview'),
		poster: text('poster', { mode: 'json' }).$type<Image | null>(),
		backdrop: text('backdrop', { mode: 'json' }).$type<Image | null>(),
		logo: text('logo', { mode: 'json' }).$type<Image | null>(),
		genres: text('genres', { mode: 'json' }).$type<string[]>().notNull().default([]),
		status: text('status').$type<ShowStatus>().notNull().default('unknown'),
		startDate: text('start_date'),
		endDate: text('end_date'),
		runtime: integer('runtime'),
		/** Books: page count. */
		pages: integer('pages'),
		rating: real('rating'),
		externalIds: text('external_ids', { mode: 'json' })
			.$type<Record<string, string | undefined>>()
			.notNull()
			.default({}),
		refreshedAt: timestamp('refreshed_at').notNull(),
		/** Last refresh that re-fetched every season (others only fetch recent seasons). */
		fullRefreshedAt: timestamp('full_refreshed_at'),
		createdAt: timestamp('created_at')
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [uniqueIndex('titles_ref_idx').on(t.provider, t.kind, t.externalId)]
);

export const seasons = sqliteTable(
	'seasons',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		titleId: integer('title_id')
			.notNull()
			.references(() => titles.id, { onDelete: 'cascade' }),
		number: integer('number').notNull(),
		name: text('name').notNull(),
		overview: text('overview'),
		poster: text('poster', { mode: 'json' }).$type<Image | null>(),
		airDate: text('air_date'),
		episodeCount: integer('episode_count').notNull().default(0)
	},
	(t) => [uniqueIndex('seasons_title_number_idx').on(t.titleId, t.number)]
);

export const episodes = sqliteTable(
	'episodes',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		titleId: integer('title_id')
			.notNull()
			.references(() => titles.id, { onDelete: 'cascade' }),
		seasonNumber: integer('season_number').notNull(),
		number: integer('number').notNull(),
		name: text('name'),
		overview: text('overview'),
		still: text('still', { mode: 'json' }).$type<Image | null>(),
		airDate: text('air_date'),
		/** Exact air time (UTC ISO), when known. */
		airAt: text('air_at'),
		runtime: integer('runtime'),
		/** Book volumes: page count. */
		pages: integer('pages'),
		externalId: text('external_id')
	},
	(t) => [uniqueIndex('episodes_title_number_idx').on(t.titleId, t.seasonNumber, t.number)]
);

// ---------- Per-user data ----------

export const libraryEntries = sqliteTable(
	'library_entries',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		titleId: integer('title_id')
			.notNull()
			.references(() => titles.id, { onDelete: 'cascade' }),
		status: text('status').$type<LibraryStatus>().notNull(),
		/** Progress for non-episodic media types (e.g. current page), reserved for books/manga. */
		progress: text('progress', { mode: 'json' }).$type<Record<string, unknown>>(),
		rating: integer('rating'),
		favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
		notes: text('notes'),
		addedAt: timestamp('added_at')
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: timestamp('updated_at')
			.notNull()
			.$defaultFn(() => new Date()),
		lastActivityAt: timestamp('last_activity_at')
	},
	(t) => [
		uniqueIndex('library_user_title_idx').on(t.userId, t.titleId),
		index('library_user_status_idx').on(t.userId, t.status)
	]
);

/** One row per watch (or, later, read). Rewatches add rows; History is a query over this table. */
export const activityEvents = sqliteTable(
	'activity_events',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		titleId: integer('title_id')
			.notNull()
			.references(() => titles.id, { onDelete: 'cascade' }),
		/** The episode (or later chapter); null for a movie or a whole book. */
		unitId: integer('unit_id').references(() => episodes.id, { onDelete: 'cascade' }),
		action: text('action', { enum: ['watched', 'read'] }).notNull(),
		occurredAt: timestamp('occurred_at').notNull(),
		source: text('source').notNull().default('manual'),
		isRepeat: integer('is_repeat', { mode: 'boolean' }).notNull().default(false),
		createdAt: timestamp('created_at')
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [
		index('activity_user_time_idx').on(t.userId, t.occurredAt),
		index('activity_user_title_idx').on(t.userId, t.titleId),
		index('activity_unit_idx').on(t.unitId)
	]
);

/** Restores from a JSON export, processed in the background. */
export const importJobs = sqliteTable('import_jobs', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	status: text('status', { enum: ['queued', 'running', 'done', 'error'] }).notNull(),
	totalTitles: integer('total_titles').notNull().default(0),
	doneTitles: integer('done_titles').notNull().default(0),
	addedEntries: integer('added_entries').notNull().default(0),
	addedEvents: integer('added_events').notNull().default(0),
	skipped: text('skipped', { mode: 'json' }).$type<string[]>().notNull().default([]),
	message: text('message'),
	createdAt: timestamp('created_at')
		.notNull()
		.$defaultFn(() => new Date()),
	finishedAt: timestamp('finished_at')
});

// ---------- Notifications ----------

export type NotificationTargetType = 'webpush' | 'ntfy' | 'discord';

export interface NotificationTargetConfig {
	/** Web Push subscription (from PushManager.subscribe). */
	subscription?: { endpoint: string; keys: { p256dh: string; auth: string } };
	/** ntfy topic URL or Discord webhook URL. */
	url?: string;
	/** ntfy access token, for protected topics. */
	token?: string;
}

/** Where a user's notifications go: a browser/device (Web Push), an ntfy topic, a Discord webhook. */
export const notificationTargets = sqliteTable(
	'notification_targets',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		type: text('type').$type<NotificationTargetType>().notNull(),
		label: text('label').notNull(),
		config: text('config', { mode: 'json' }).$type<NotificationTargetConfig>().notNull(),
		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
		lastError: text('last_error'),
		lastSentAt: timestamp('last_sent_at'),
		createdAt: timestamp('created_at')
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [index('notification_targets_user_idx').on(t.userId)]
);

/** Episodes a user was already notified about, so nothing is sent twice. */
export const notificationsSent = sqliteTable(
	'notifications_sent',
	{
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		episodeId: integer('episode_id')
			.notNull()
			.references(() => episodes.id, { onDelete: 'cascade' }),
		sentAt: timestamp('sent_at').notNull()
	},
	(t) => [primaryKey({ columns: [t.userId, t.episodeId] })]
);
