CREATE TABLE `import_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`status` text NOT NULL,
	`total_titles` integer DEFAULT 0 NOT NULL,
	`done_titles` integer DEFAULT 0 NOT NULL,
	`added_entries` integer DEFAULT 0 NOT NULL,
	`added_events` integer DEFAULT 0 NOT NULL,
	`skipped` text DEFAULT '[]' NOT NULL,
	`message` text,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
