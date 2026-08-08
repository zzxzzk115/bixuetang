CREATE TABLE `study_rooms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`emoji` text,
	`created_by` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `study_presence` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`room_id` integer NOT NULL,
	`entered_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `study_rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `study_presence_room` ON `study_presence` (`room_id`);
--> statement-breakpoint
INSERT INTO `study_rooms` (`name`, `emoji`, `created_by`, `created_at`) VALUES ('综合自习室', '📚', NULL, 0);
--> statement-breakpoint
INSERT INTO `study_rooms` (`name`, `emoji`, `created_by`, `created_at`) VALUES ('深夜冲刺室', '🌙', NULL, 0);
