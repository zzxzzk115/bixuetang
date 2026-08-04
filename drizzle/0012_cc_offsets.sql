CREATE TABLE `cc_offsets` (
	`user_id` integer NOT NULL,
	`cid` integer NOT NULL,
	`offset_ms` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `cid`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
