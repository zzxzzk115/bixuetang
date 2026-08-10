CREATE TABLE `league_standing` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`tier` text DEFAULT 'bronze' NOT NULL,
	`settled_week` integer NOT NULL,
	`pending_result` text,
	`pending_from_tier` text,
	`pending_to_tier` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `league_meta` (
	`id` integer PRIMARY KEY NOT NULL,
	`settled_week` integer NOT NULL
);
