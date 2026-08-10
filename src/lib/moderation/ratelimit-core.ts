import { and, gte, sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";

// 限流的纯逻辑 + DB 无关的计数,单独拆出来不 import db/client(那会拉进 server-only,
// 单测跑不了)。ratelimit.ts 负责绑定真实 db;这里可用内存库直接测。

export interface RateRule {
  windowMs: number;
  max: number; // 窗口内允许的最大条数
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

// 各写入点的额度:正常用户永远够用,只挡机器人/恶意刷屏。
export const RATE = {
  courseTip: { windowMs: HOUR, max: 8 }, // 课程心得:8 条/时
  careerSuggestion: { windowMs: DAY, max: 5 }, // 职业建议:5 条/天
  studyRoom: { windowMs: DAY, max: 5 }, // 建自习室:5 间/天
  follow: { windowMs: HOUR, max: 60 }, // 关注:60 次/时
  feedComment: { windowMs: HOUR, max: 30 }, // 动态评论:30 条/时
} satisfies Record<string, RateRule>;

// 数该用户在 [now-windowMs, now] 内往这张表写了几行。传入 db,便于测试。
// 接受带/不带 schema 的库(真实 db 带 schema、测试内存库不带),故 schema 泛型放宽。
type AnySyncDb = BaseSQLiteDatabase<
  "sync",
  unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 兼容带 schema 与不带 schema 两种 db
  any
>;

export function countRecent(
  database: AnySyncDb,
  table: SQLiteTable,
  userIdCol: SQLiteColumn,
  createdAtCol: SQLiteColumn,
  userId: number,
  windowMs: number,
  nowMs: number,
): number {
  const since = nowMs - windowMs;
  const row = database
    .select({ n: sql<number>`count(*)` })
    .from(table)
    .where(and(sql`${userIdCol} = ${userId}`, gte(createdAtCol, since)))
    .get() as { n: number } | undefined;
  return row?.n ?? 0;
}

// 纯判定:达到上限即"该拒了"。
export function isOverLimit(count: number, rule: RateRule): boolean {
  return count >= rule.max;
}
