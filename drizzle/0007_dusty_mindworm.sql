CREATE TABLE `xp_boosts` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`multiplier_pct` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
