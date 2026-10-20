CREATE TABLE `activity_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`title_id` integer NOT NULL,
	`unit_id` integer,
	`action` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`is_repeat` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`title_id`) REFERENCES `titles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`unit_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_user_time_idx` ON `activity_events` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `activity_user_title_idx` ON `activity_events` (`user_id`,`title_id`);--> statement-breakpoint
CREATE INDEX `activity_unit_idx` ON `activity_events` (`unit_id`);--> statement-breakpoint
CREATE TABLE `episodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title_id` integer NOT NULL,
	`season_number` integer NOT NULL,
	`number` integer NOT NULL,
	`name` text,
	`overview` text,
	`still` text,
	`air_date` text,
	`air_at` text,
	`runtime` integer,
	`external_id` text,
	FOREIGN KEY (`title_id`) REFERENCES `titles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_title_number_idx` ON `episodes` (`title_id`,`season_number`,`number`);--> statement-breakpoint
CREATE TABLE `library_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`title_id` integer NOT NULL,
	`status` text NOT NULL,
	`progress` text,
	`rating` integer,
	`favorite` integer DEFAULT false NOT NULL,
	`notes` text,
	`added_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_activity_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`title_id`) REFERENCES `titles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `library_user_title_idx` ON `library_entries` (`user_id`,`title_id`);--> statement-breakpoint
CREATE INDEX `library_user_status_idx` ON `library_entries` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title_id` integer NOT NULL,
	`number` integer NOT NULL,
	`name` text NOT NULL,
	`overview` text,
	`poster` text,
	`air_date` text,
	`episode_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`title_id`) REFERENCES `titles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seasons_title_number_idx` ON `seasons` (`title_id`,`number`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `titles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`kind` text NOT NULL,
	`external_id` text NOT NULL,
	`media_type` text NOT NULL,
	`is_anime` integer DEFAULT false NOT NULL,
	`name` text NOT NULL,
	`original_name` text,
	`overview` text,
	`poster` text,
	`backdrop` text,
	`logo` text,
	`genres` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`start_date` text,
	`end_date` text,
	`runtime` integer,
	`rating` real,
	`external_ids` text DEFAULT '{}' NOT NULL,
	`refreshed_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `titles_ref_idx` ON `titles` (`provider`,`kind`,`external_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`disabled` integer DEFAULT false NOT NULL,
	`prefs` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);