import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/client";
import { userState, xpEvents } from "../db/schema";
import { dayStartMs } from "./day";
import type { DailyProgress } from "./daily-goal";

// 当日(UTC+8)经验进度:goal 取用户设定(缺省 50),todayXp = 今日 xp_events 之和。
export function getDailyProgress(userId: number, now = Date.now()): DailyProgress {
  const row = db
    .select({ goal: userState.dailyGoal })
    .from(userState)
    .where(eq(userState.userId, userId))
    .get();
  const goal = row?.goal ?? 50;
  const start = dayStartMs(now);
  const todayXp =
    db
      .select({ n: sql<number>`coalesce(sum(${xpEvents.amount}),0)` })
      .from(xpEvents)
      .where(and(eq(xpEvents.userId, userId), gte(xpEvents.createdAt, start)))
      .get()?.n ?? 0;
  const pct = goal > 0 ? Math.min(100, Math.round((todayXp / goal) * 100)) : 100;
  return { goal, todayXp, pct, met: todayXp >= goal };
}
