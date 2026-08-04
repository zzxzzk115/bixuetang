-- 经验药水改为按「集数」计（原按到期时间）。xp_boosts 是刚上线的表，直接重建。
DROP TABLE IF EXISTS `xp_boosts`;
--> statement-breakpoint
CREATE TABLE `xp_boosts` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`multiplier_pct` integer NOT NULL,
	`episodes_left` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bili_accounts` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`mid` text NOT NULL,
	`nickname` text,
	`avatar_url` text,
	`sessdata` text NOT NULL,
	`bili_jct` text,
	`refresh_token` text,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `episode_watch` (
	`user_id` integer NOT NULL,
	`course_id` text NOT NULL,
	`episode_n` integer NOT NULL,
	`position_sec` integer DEFAULT 0 NOT NULL,
	`duration_sec` integer DEFAULT 0 NOT NULL,
	`ratio_pct` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `course_id`, `episode_n`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
