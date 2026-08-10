CREATE TABLE `feed_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`type` text NOT NULL,
	`ref_key` text NOT NULL,
	`payload` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feed_user_type_ref` ON `feed_events` (`user_id`,`type`,`ref_key`);
--> statement-breakpoint
CREATE INDEX `feed_created` ON `feed_events` (`created_at`);
