--> 先化解历史重复：同一个 bilibili mid 绑到多个账号时，只保留最早建号的那个，
--> 其余账号只是「解绑」（删 bili_accounts 行，账号本身仍在，可用密码登录）。
DELETE FROM `bili_accounts`
WHERE `user_id` NOT IN (
  SELECT MIN(`user_id`) FROM `bili_accounts` GROUP BY `mid`
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bili_accounts_mid_unique` ON `bili_accounts` (`mid`);
