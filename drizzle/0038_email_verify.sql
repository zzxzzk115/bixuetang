ALTER TABLE `users` ADD `email_verified` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `users` SET `email_verified` = 1 WHERE `email` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE `email_verifications` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`email` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
