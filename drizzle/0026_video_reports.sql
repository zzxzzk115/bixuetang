CREATE TABLE `video_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`course_id` text NOT NULL,
	`episode_n` integer NOT NULL,
	`bvid` text NOT NULL,
	`kind` text DEFAULT 'gone' NOT NULL,
	`note` text,
	`resolved` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `video_reports_uniq` ON `video_reports` (`user_id`,`course_id`,`episode_n`,`bvid`);
--> statement-breakpoint
CREATE INDEX `video_reports_course` ON `video_reports` (`course_id`,`episode_n`);
