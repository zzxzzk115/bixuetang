CREATE TABLE `admin_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`must_change_password` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_users_username_unique` ON `admin_users` (`username`);
--> statement-breakpoint
CREATE TABLE `admin_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`admin_user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`admin_user_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `admin_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`admin_user_id` integer NOT NULL,
	`action` text NOT NULL,
	`target_user_id` integer,
	`detail` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`admin_user_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `admin_audit_target` ON `admin_audit` (`target_user_id`);
