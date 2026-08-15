ALTER TABLE `streak_state` ADD `lost_streak` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `streak_state` ADD `lost_day` text DEFAULT '' NOT NULL;
