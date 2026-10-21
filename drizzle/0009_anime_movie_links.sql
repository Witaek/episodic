CREATE TABLE `anime_movie_links` (
	`imdb_id` text PRIMARY KEY NOT NULL,
	`tmdb_movie_id` integer,
	`checked_at` integer NOT NULL
);
