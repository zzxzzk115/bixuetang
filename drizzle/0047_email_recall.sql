ALTER TABLE `user_state` ADD `email_recall` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `user_state` ADD `recall_sent_day` text DEFAULT '' NOT NULL;
