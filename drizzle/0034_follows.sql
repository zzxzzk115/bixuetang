CREATE TABLE `follows` (
	`follower_id` integer NOT NULL,
	`followee_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`follower_id`, `followee_id`),
	FOREIGN KEY (`follower_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`followee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `follows_followee` ON `follows` (`followee_id`);
