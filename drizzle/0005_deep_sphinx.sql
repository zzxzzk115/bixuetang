CREATE TABLE `rpg_equipment` (
	`user_id` integer NOT NULL,
	`slot` integer NOT NULL,
	`item_id` text NOT NULL,
	`equipped_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `slot`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rpg_equipment_user_item` ON `rpg_equipment` (`user_id`,`item_id`);