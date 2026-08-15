import "server-only";

import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { streakState, userState, xpEvents } from "../db/schema";
import { addDays, dayKey, diffDays } from "./day";
import { advanceStreak, emptyStreak, type StreakAdvance, type StreakState } from "./streak";
import { recordFeed } from "./feed";

/** 连胜里程碑:达到这些天数时播一条好友动态 */
const STREAK_MILESTONES = new Set([3, 7, 14, 30, 60, 100, 200, 365]);

/** 读取请假截止 dayKey(含);未请假为 null */
export function vacationUntilOf(userId: number): string | null {
  const row = db
    .select({ v: userState.vacationUntil })
    .from(userState)
    .where(eq(userState.userId, userId))
    .get();
  return row?.v ?? null;
}

/** 是否此刻处于请假期(今天 <= 截止日) */
export function isOnVacation(userId: number, today = dayKey()): boolean {
  const v = vacationUntilOf(userId);
  return !!v && today <= v;
}

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
    const today = dayKey();
    const vac = vacationUntilOf(userId);
    // 请假中:连胜冻结,缺勤不算断
    if (vac && today <= vac) {
      return {
        current: row.current,
        best: row.best,
        lastDay: row.lastDay,
        freezes: row.freezes,
      };
    }
    // 请假刚过:把假期缺的天数一并原谅(锚点挪到假期最后一天),并清掉标记
    let lastDay = row.lastDay;
    if (vac) {
      if (lastDay < vac) lastDay = vac;
      db.update(userState)
        .set({ vacationUntil: null, updatedAt: Date.now() })
        .where(eq(userState.userId, userId))
        .run();
    }
    // 断档但还没有新学习行为时,显示上仍要如实归零(状态行不动,
    // 等下次 recordActivity 再落库)
    const gap = lastDay ? diffDays(lastDay, today) : 0;
    const broken = gap > 2 || (gap === 2 && row.freezes <= 0);
    // 刚断掉:快照断掉的连胜天数,供「连胜修复」在限时窗口内补回(只写一次)
    if (
      broken &&
      row.current > 0 &&
      (row.lostStreak !== row.current || row.lostDay !== lastDay)
    ) {
      db.update(streakState)
        .set({ lostStreak: row.current, lostDay: lastDay, updatedAt: Date.now() })
        .where(eq(streakState.userId, userId))
        .run();
    }
    return {
      current: broken ? 0 : row.current,
      best: row.best,
      lastDay,
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
  // 请假中:连胜冻结,今天学不学都不动(不断也不涨)
  if (isOnVacation(userId)) {
    const s = getStreak(userId);
    return { ...s, changed: false, usedFreeze: false };
  }
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
  // 连胜达标(且今天确实推进了)播一条动态,幂等键=天数,同一里程碑一辈子只播一次
  if (advanced.changed && STREAK_MILESTONES.has(advanced.current)) {
    recordFeed(userId, "streak", String(advanced.current), { days: advanced.current });
  }
  return advanced;
}

/** 商店购买连胜冻结时调用;上限 2 枚,超买是浪费金币 */
export const MAX_FREEZES = 2;
/** 连胜冻结售价(损失厌恶的安全阀:断一天时自动消耗、连胜不清零) */
export const FREEZE_PRICE = 200;

// —— 连胜修复:断掉后限时窗口内,花金币把连胜补回原来的天数 ——
/** 至少断掉这么多天的连胜才值得修复(太短不给,免得刷) */
export const STREAK_REPAIR_MIN = 3;
/** 断掉后多少天内可修复(过期作废) */
export const STREAK_REPAIR_GRACE_DAYS = 7;

/** 修复断掉的 N 天连胜要多少金币(封顶 300) */
export function streakRepairCost(lostStreak: number): number {
  return Math.min(300, lostStreak * 20);
}

export interface StreakRepairInfo {
  available: boolean;
  lostStreak: number;
  cost: number;
}

export function getStreakRepair(userId: number): StreakRepairInfo {
  // 先走 getStreak(会在断掉时落快照);再读原始行拿 lostStreak
  const shown = getStreak(userId);
  const row = db
    .select({ lostStreak: streakState.lostStreak, lostDay: streakState.lostDay })
    .from(streakState)
    .where(eq(streakState.userId, userId))
    .get();
  const lost = row?.lostStreak ?? 0;
  const lostDay = row?.lostDay ?? "";
  const withinGrace = lostDay
    ? diffDays(lostDay, dayKey()) <= STREAK_REPAIR_GRACE_DAYS
    : false;
  const available =
    shown.current === 0 && lost >= STREAK_REPAIR_MIN && withinGrace;
  return { available, lostStreak: lost, cost: streakRepairCost(lost) };
}

/** 执行修复:把连胜补回 lostStreak,锚点挪到昨天(今天再学就接着 +1)。清空快照。 */
export function applyStreakRepair(userId: number, lostStreak: number): void {
  const now = Date.now();
  const yesterday = addDays(dayKey(), -1);
  const row = db
    .select({ best: streakState.best })
    .from(streakState)
    .where(eq(streakState.userId, userId))
    .get();
  db.update(streakState)
    .set({
      current: lostStreak,
      best: Math.max(row?.best ?? 0, lostStreak),
      lastDay: yesterday,
      lostStreak: 0,
      lostDay: "",
      updatedAt: now,
    })
    .where(eq(streakState.userId, userId))
    .run();
}

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
