import "server-only";

import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { streakState, xpEvents } from "../db/schema";
import { dayKey, diffDays } from "./day";
import { advanceStreak, emptyStreak, type StreakAdvance, type StreakState } from "./streak";

// streak 的持久层封装。状态存 streak_state 表(纯函数逻辑见 streak.ts);
// 老用户第一次读取时用 xp_events 流水按 UTC+8 日切回填一次,连胜不清零。

/** 从 XP 流水推导截至今天的连胜(仅用于老用户首读回填) */
function deriveLegacyStreak(userId: number, today: string): StreakState {
  const days = new Set(
    db
      .select({ createdAt: xpEvents.createdAt })
      .from(xpEvents)
      .where(eq(xpEvents.userId, userId))
      .all()
      .map((row) => dayKey(row.createdAt)),
  );
  if (days.size === 0) return emptyStreak();

  // 从今天(或昨天,今天还没学不该断)往回数连续天数
  const cursorOffset = days.has(today) ? 0 : 1;
  let current = 0;
  let lastDay = "";
  for (;;) {
    const key = dayKey(Date.now() - (cursorOffset + current) * 86_400_000);
    if (!days.has(key)) break;
    if (current === 0) lastDay = key;
    current++;
  }
  // best 用回填出的 current 打底(历史最高无从考证,宁可低估)
  return { current, best: current, lastDay, freezes: 0 };
}

export function getStreak(userId: number): StreakState {
  const row = db
    .select()
    .from(streakState)
    .where(eq(streakState.userId, userId))
    .get();
  if (row) {
    // 断档但还没有新学习行为时,显示上仍要如实归零(状态行不动,
    // 等下次 recordActivity 再落库)
    const gap = row.lastDay ? diffDays(row.lastDay, dayKey()) : 0;
    const broken = gap > 2 || (gap === 2 && row.freezes <= 0);
    return {
      current: broken ? 0 : row.current,
      best: row.best,
      lastDay: row.lastDay,
      freezes: row.freezes,
    };
  }
  const legacy = deriveLegacyStreak(userId, dayKey());
  db.insert(streakState)
    .values({
      userId,
      current: legacy.current,
      best: legacy.best,
      lastDay: legacy.lastDay,
      freezes: 0,
      updatedAt: Date.now(),
    })
    .onConflictDoNothing()
    .run();
  return legacy;
}

/**
 * 今天有学习行为(完成一集/完成复习/打一场试炼)时调用。
 * 返回推进结果,UI 据 changed/usedFreeze 决定要不要庆祝或提示。
 */
export function recordActivity(userId: number): StreakAdvance {
  const state = (() => {
    const row = db
      .select()
      .from(streakState)
      .where(eq(streakState.userId, userId))
      .get();
    if (row) {
      return {
        current: row.current,
        best: row.best,
        lastDay: row.lastDay,
        freezes: row.freezes,
      };
    }
    return getStreak(userId);
  })();

  const advanced = advanceStreak(state, dayKey());
  if (advanced.changed || advanced.usedFreeze) {
    db.insert(streakState)
      .values({
        userId,
        current: advanced.current,
        best: advanced.best,
        lastDay: advanced.lastDay,
        freezes: advanced.freezes,
        updatedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: streakState.userId,
        set: {
          current: advanced.current,
          best: advanced.best,
          lastDay: advanced.lastDay,
          freezes: advanced.freezes,
          updatedAt: Date.now(),
        },
      })
      .run();
  }
  return advanced;
}

/** 商店购买连胜冻结时调用;上限 2 枚,超买是浪费金币 */
export const MAX_FREEZES = 2;
/** 连胜冻结售价(损失厌恶的安全阀:断一天时自动消耗、连胜不清零) */
export const FREEZE_PRICE = 200;

export function addFreeze(userId: number): { ok: boolean; freezes: number } {
  const state = getStreak(userId);
  if (state.freezes >= MAX_FREEZES) return { ok: false, freezes: state.freezes };
  const next = state.freezes + 1;
  db.insert(streakState)
    .values({
      userId,
      current: state.current,
      best: state.best,
      lastDay: state.lastDay,
      freezes: next,
      updatedAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: streakState.userId,
      set: { freezes: next, updatedAt: Date.now() },
    })
    .run();
  return { ok: true, freezes: next };
}
