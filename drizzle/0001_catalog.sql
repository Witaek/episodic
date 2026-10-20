CREATE TABLE `anime_mappings` (
	`anilist_id` integer PRIMARY KEY NOT NULL,
	`mal_id` integer,
	`format` text,
	`tmdb_tv_id` integer,
	`tmdb_movie_id` integer,
	`tmdb_season` integer,
	`tmdb_episode_offset` integer,
	`tvdb_id` integer,
	`imdb_id` text
);
--> statement-breakpoint
CREATE INDEX `anime_mappings_tmdb_tv_idx` ON `anime_mappings` (`tmdb_tv_id`);--> statement-breakpoint
CREATE INDEX `anime_mappings_tmdb_movie_idx` ON `anime_mappings` (`tmdb_movie_id`);--> statement-breakpoint
CREATE TABLE `api_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `api_cache_expires_idx` ON `api_cache` (`expires_at`);--> statement-breakpoint
CREATE TABLE `job_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job` text NOT NULL,
	`status` text NOT NULL,
	`message` text,
	`started_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `job_runs_job_idx` ON `job_runs` (`job`,`started_at`);