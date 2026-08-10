import "server-only";

import { eq } from "drizzle-orm";
import { achievementUnlocks, leagueStanding, xpEvents } from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import { getSubjectXp, getUserProgress } from "@/lib/progress/queries";
import { getStreak } from "./streak-server";
import { tierIndex } from "./league";
import { recordFeed } from "./feed";

// 成就:达成条件即解锁(幂等),解锁的瞬间落一条好友动态。
// 条件全部由现有数据推导(xp 流水/进度/连胜/段位),无需额外埋点。

export const ACHIEVEMENTS = [
  { id: "first-encounter", title: "初次交锋", description: "完成第一场课程遭遇" },
  { id: "first-checkpoint", title: "战后复盘", description: "提交第一份本集复述" },
  { id: "dungeon-clear", title: "首领讨伐者", description: "完整通关一门课程" },
  { id: "workshop-initiate", title: "工坊见习", description: "完成第一项实验任务" },
  { id: "kana-adept", title: "假名初成", description: "在五十音图里通关一次测验" },
  { id: "streak-7", title: "七日不辍", description: "连续学习达到 7 天" },
  { id: "streak-30", title: "月满不缺", description: "连续学习达到 30 天" },
  { id: "silver-league", title: "白银之上", description: "段位升到白银或更高" },
  { id: "polymath", title: "四域行者", description: "在四个学科分部都获得经验" },
] as const;

export interface AchievementView {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  unlockedAt?: number;
}

/** 检测并解锁达成的成就(幂等);新解锁的会各落一条好友动态。返回全量成就视图。 */
export function syncAchievements(userId: number): AchievementView[] {
  const progress = getUserProgress(userId);
  const subjectXp = getSubjectXp(progress);
  const reasons = new Set(
    db
      .select({ reason: xpEvents.reason })
      .from(xpEvents)
      .where(eq(xpEvents.userId, userId))
      .all()
      .map((row) => row.reason),
  );
  const streakBest = getStreak(userId).best;
  const standing = db
    .select({ tier: leagueStanding.tier })
    .from(leagueStanding)
    .where(eq(leagueStanding.userId, userId))
    .get();
  const tierIdx = standing ? tierIndex(standing.tier) : 1;

  const conditions: Record<string, boolean> = {
    "first-encounter": reasons.has("episode"),
    "first-checkpoint": reasons.has("checkpoint"),
    "dungeon-clear": reasons.has("course-done"),
    "workshop-initiate": reasons.has("lab-task"),
    "kana-adept": reasons.has("kana"),
    "streak-7": streakBest >= 7,
    "streak-30": streakBest >= 30,
    "silver-league": tierIdx >= 2, // silver = 2
    polymath: Object.values(subjectXp).every((value) => value > 0),
  };

  // 记住此前已解锁的,好在插入后只为「新」解锁的播动态
  const before = new Set(
    db
      .select({ id: achievementUnlocks.achievementId })
      .from(achievementUnlocks)
      .where(eq(achievementUnlocks.userId, userId))
      .all()
      .map((r) => r.id),
  );

  const now = Date.now();
  for (const def of ACHIEVEMENTS) {
    if (!conditions[def.id] || before.has(def.id)) continue;
    db.insert(achievementUnlocks)
      .values({ userId, achievementId: def.id, unlockedAt: now })
      .onConflictDoNothing()
      .run();
    recordFeed(userId, "achievement", def.id, { title: def.title });
  }

  const unlocked = new Map(
    db
      .select()
      .from(achievementUnlocks)
      .where(eq(achievementUnlocks.userId, userId))
      .all()
      .map((row) => [row.achievementId, row.unlockedAt]),
  );
  return ACHIEVEMENTS.map((def) => ({
    ...def,
    unlocked: unlocked.has(def.id),
    unlockedAt: unlocked.get(def.id),
  }));
}
