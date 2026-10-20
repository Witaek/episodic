CREATE TABLE `notification_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`config` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_error` text,
	`last_sent_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_targets_user_idx` ON `notification_targets` (`user_id`);--> statement-breakpoint
CREATE TABLE `notifications_sent` (
	`user_id` integer NOT NULL,
	`episode_id` integer NOT NULL,
	`sent_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `episode_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade
);
