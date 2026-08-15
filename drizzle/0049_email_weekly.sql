ALTER TABLE `user_state` ADD `email_weekly` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `user_state` ADD `weekly_sent_day` text DEFAULT '' NOT NULL;
