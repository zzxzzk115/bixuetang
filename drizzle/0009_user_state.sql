CREATE TABLE `user_state` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`route_id` text,
	`last_course_id` text,
	`last_episode_n` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
