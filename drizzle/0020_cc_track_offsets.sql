CREATE TABLE `cc_track_offsets` (
	`user_id` integer NOT NULL,
	`cid` integer NOT NULL,
	`lan` text NOT NULL,
	`offset_ms` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `cid`, `lan`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cc_track_offsets_cid_lan` ON `cc_track_offsets` (`cid`,`lan`);
