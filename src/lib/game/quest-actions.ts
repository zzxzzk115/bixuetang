"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { questInstances, rpgProfiles, xpEvents } from "@/lib/db/schema";
import {
  getDailyQuests,
  getMonthlyQuest,
  PERFECT_DAY_COINS,
  PERFECT_DAY_XP,
  type DailyQuestView,
  type MonthlyQuestView,
  type PerfectDayReward,
} from "@/lib/game/quests";
import { levelFromXp } from "@/lib/game/level";
import { getTotalXp } from "@/lib/progress/queries";

/** 客户端拉取当前每日任务快照(用于完成特效的 diff) */
export async function fetchDailyQuests(): Promise<DailyQuestView[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  return getDailyQuests(user.id);
}

/** 领取月度任务奖励(本月累计任务数达标后) */
export async function claimMonthlyQuest(): Promise<{
  ok: boolean;
  error?: string;
  reward?: { xp: number; coins: number };
}> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };
  const monthly: MonthlyQuestView = getMonthlyQuest(user.id);
  if (!monthly.complete) return { ok: false, error: "本月任务还没达标" };
  if (monthly.claimed) return { ok: true };

  const now = Date.now();
  const inserted = db
    .insert(xpEvents)
    .values({
      userId: user.id,
      amount: monthly.rewardXp,
      reason: "monthly-quest",
      ref: monthly.monthKey,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ amount: xpEvents.amount })
    .get();
  if (!inserted) return { ok: true }; // 已领(并发兜底)

  db.insert(rpgProfiles)
    .values({ userId: user.id, coins: monthly.rewardCoins, updatedAt: now })
    .onConflictDoUpdate({
      target: rpgProfiles.userId,
      set: {
        coins: sql`${rpgProfiles.coins} + ${monthly.rewardCoins}`,
        updatedAt: now,
      },
    })
    .run();
  revalidatePath("/");
  revalidatePath("/play/trial");
  return { ok: true, reward: { xp: monthly.rewardXp, coins: monthly.rewardCoins } };
}

export async function claimDailyQuest(questId: number): Promise<{
  ok: boolean;
  error?: string;
  gained?: number;
  levelUp?: boolean;
  newLevel?: number;
  /** 领完最后一条 → 全勤奖(否则 undefined) */
  perfectDay?: PerfectDayReward;
}> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };
  const quest = db
    .select()
    .from(questInstances)
    .where(
      and(
        eq(questInstances.id, questId),
        eq(questInstances.userId, user.id),
      ),
    )
    .get();
  if (!quest) return { ok: false, error: "委托不存在" };
  const view = getDailyQuests(user.id, quest.dateKey).find(
    (item) => item.id === questId,
  );
  if (!view?.complete) return { ok: false, error: "委托目标尚未完成" };
  if (view.claimed) return { ok: true, gained: 0 };

  const before = getTotalXp(user.id);
  const beforeLevel = levelFromXp(before);
  const now = Date.now();
  db.insert(xpEvents)
    .values({
      userId: user.id,
      amount: quest.rewardXp,
      reason: "daily-quest",
      ref: String(quest.id),
      createdAt: now,
    })
    .onConflictDoNothing()
    .run();
  db.update(questInstances)
    .set({ claimedAt: now })
    .where(eq(questInstances.id, quest.id))
    .run();

  // 全勤检测:今天所有任务都已领取 → 发一次性全勤奖(幂等键 perfect-day:dayKey)
  let perfectDay: PerfectDayReward | undefined;
  const todayQuests = getDailyQuests(user.id, quest.dateKey);
  if (todayQuests.length > 0 && todayQuests.every((q) => q.claimed)) {
    const inserted = db
      .insert(xpEvents)
      .values({
        userId: user.id,
        amount: PERFECT_DAY_XP,
        reason: "daily-perfect",
        ref: quest.dateKey,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ amount: xpEvents.amount })
      .get();
    if (inserted) {
      db.insert(rpgProfiles)
        .values({ userId: user.id, coins: PERFECT_DAY_COINS, updatedAt: now })
        .onConflictDoUpdate({
          target: rpgProfiles.userId,
          set: {
            coins: sql`${rpgProfiles.coins} + ${PERFECT_DAY_COINS}`,
            updatedAt: now,
          },
        })
        .run();
      perfectDay = { xp: PERFECT_DAY_XP, coins: PERFECT_DAY_COINS };
    }
  }

  const total = getTotalXp(user.id);
  const newLevel = levelFromXp(total);
  revalidatePath("/");
  revalidatePath("/me");
  return {
    ok: true,
    gained: total - before,
    levelUp: newLevel > beforeLevel,
    newLevel,
    perfectDay,
  };
}
