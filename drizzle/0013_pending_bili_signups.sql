CREATE TABLE `pending_bili_signups` (
	`token` text PRIMARY KEY NOT NULL,
	`mid` text NOT NULL,
	`nickname` text,
	`avatar_url` text,
	`sessdata` text NOT NULL,
	`bili_jct` text,
	`refresh_token` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
