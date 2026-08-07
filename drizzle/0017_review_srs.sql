CREATE TABLE `review_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`course_id` text NOT NULL,
	`episode_n` integer NOT NULL,
	`kind` text NOT NULL,
	`prompt` text NOT NULL,
	`due_day` text NOT NULL,
	`interval_days` integer DEFAULT 0 NOT NULL,
	`ease` integer DEFAULT 230 NOT NULL,
	`reps` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`last_reviewed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_cards_identity` ON `review_cards` (`user_id`,`course_id`,`episode_n`,`kind`,`prompt`);
--> statement-breakpoint
CREATE INDEX `review_cards_due` ON `review_cards` (`user_id`,`due_day`);
--> statement-breakpoint
CREATE TABLE `streak_state` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`current` integer DEFAULT 0 NOT NULL,
	`best` integer DEFAULT 0 NOT NULL,
	`last_day` text DEFAULT '' NOT NULL,
	`freezes` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
