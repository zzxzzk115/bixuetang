CREATE TABLE `achievement_unlocks` (
	`user_id` integer NOT NULL,
	`achievement_id` text NOT NULL,
	`unlocked_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `achievement_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `checkpoint_attempts` (
	`user_id` integer NOT NULL,
	`course_id` text NOT NULL,
	`episode_n` integer NOT NULL,
	`checkpoint_id` text NOT NULL,
	`response` text NOT NULL,
	`passed` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `course_id`, `episode_n`, `checkpoint_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `learning_sessions` (
	`user_id` integer NOT NULL,
	`course_id` text NOT NULL,
	`episode_n` integer NOT NULL,
	`focus_minutes` integer DEFAULT 0 NOT NULL,
	`summary` text,
	`started_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	PRIMARY KEY(`user_id`, `course_id`, `episode_n`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quest_instances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`date_key` text NOT NULL,
	`kind` text NOT NULL,
	`course_id` text NOT NULL,
	`episode_n` integer NOT NULL,
	`target` integer NOT NULL,
	`reward_xp` integer NOT NULL,
	`claimed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quest_instances_user_date_kind` ON `quest_instances` (`user_id`,`date_key`,`kind`);