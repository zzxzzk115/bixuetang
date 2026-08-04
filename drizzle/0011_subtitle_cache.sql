CREATE TABLE `subtitle_cache` (
	`cid` integer PRIMARY KEY NOT NULL,
	`bvid` text NOT NULL,
	`tracks_json` text NOT NULL,
	`has_human` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
