ALTER TABLE `users` ADD `calendar_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_calendar_token_unique` ON `users` (`calendar_token`);