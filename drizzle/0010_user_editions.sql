CREATE TABLE `user_editions` (
	`user_id` integer NOT NULL,
	`work` text NOT NULL,
	`edition_id` text NOT NULL,
	`title` text NOT NULL,
	`cover` text,
	`pages` integer,
	`language` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `work`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT OR IGNORE INTO `user_editions` (`user_id`, `work`, `edition_id`, `title`, `cover`, `pages`, `language`, `updated_at`)
SELECT le.`user_id`, t.`external_id`, json_extract(le.`progress`, '$.edition.id'), json_extract(le.`progress`, '$.edition.title'), json_extract(le.`progress`, '$.edition.cover'), json_extract(le.`progress`, '$.edition.pages'), json_extract(le.`progress`, '$.edition.language'), CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM `library_entries` le JOIN `titles` t ON t.`id` = le.`title_id`
WHERE t.`kind` = 'book' AND json_extract(le.`progress`, '$.edition.id') IS NOT NULL AND json_extract(le.`progress`, '$.edition.title') IS NOT NULL;
