ALTER TABLE `xp_boosts` ADD `timed_multiplier_pct` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `xp_boosts` ADD `timed_expires_at` integer DEFAULT 0 NOT NULL;
