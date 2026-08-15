CREATE TABLE `mistakes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`course_id` text NOT NULL,
	`ep_n` integer NOT NULL,
	`kind` text NOT NULL,
	`prompt` text NOT NULL,
	`answer` text NOT NULL,
	`times_wrong` integer DEFAULT 1 NOT NULL,
	`added_at` integer NOT NULL,
	`last_wrong_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mistake_user_course_prompt` ON `mistakes` (`user_id`,`course_id`,`prompt`);
--> statement-breakpoint
CREATE INDEX `mistake_user` ON `mistakes` (`user_id`);
