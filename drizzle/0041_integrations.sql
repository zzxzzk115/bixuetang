CREATE TABLE `integrations` (
	`user_id` integer NOT NULL,
	`provider` text NOT NULL,
	`token` text NOT NULL,
	`config` text,
	`last_synced_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `provider`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
