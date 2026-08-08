import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { db } from "../db/client";
import { countRecent, isOverLimit, type RateRule } from "./ratelimit-core";

// 防刷屏/爆库:按"窗口内该用户已写了几行"限流。直接数目标表本身——
// 不引新表、随时间自动滑走,而且它拦的正是会落库的那批行,天然给库量封顶。
//
// 用法:每个 UGC/社交写动作在插入前调 overRateLimit(...),超了就拒。
// 纯逻辑与计数在 ratelimit-core.ts(可单测);这里只绑定真实 db + 当前时间。

export { RATE, type RateRule } from "./ratelimit-core";

// 超额返回 true(即"该拒了")。
export function overRateLimit(
  table: SQLiteTable,
  userIdCol: SQLiteColumn,
  createdAtCol: SQLiteColumn,
  userId: number,
  rule: RateRule,
): boolean {
  const count = countRecent(
    db,
    table,
    userIdCol,
    createdAtCol,
    userId,
    rule.windowMs,
    Date.now(),
  );
  return isOverLimit(count, rule);
}
