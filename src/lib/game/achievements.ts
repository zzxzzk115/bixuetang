import "server-only";

import { eq } from "drizzle-orm";
import { achievementUnlocks, xpEvents } from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import { getSubjectXp, getUserProgress } from "@/lib/progress/queries";

export const ACHIEVEMENTS = [
  { id: "first-encounter", title: "初次交锋", description: "完成第一场课程遭遇" },
  { id: "first-checkpoint", title: "战后复盘", description: "提交第一份本集复述" },
  { id: "dungeon-clear", title: "首领讨伐者", description: "完整通关一门课程" },
  { id: "skill-awakened", title: "知识觉醒", description: "点亮第一个技能节点" },
  { id: "workshop-initiate", title: "工坊见习", description: "完成第一项实验任务" },
  { id: "polymath", title: "四域行者", description: "在四个学科分部都获得经验" },
] as const;

export interface AchievementView {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  unlockedAt?: number;
}

export function learningStreak(userId: number, now = new Date()): number {
  const dates = new Set(
    db
      .select({ createdAt: xpEvents.createdAt })
      .from(xpEvents)
      .where(eq(xpEvents.userId, userId))
      .all()
      .map((row) => new Date(row.createdAt).toISOString().slice(0, 10)),
  );
  let streak = 0;
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

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
  const conditions: Record<string, boolean> = {
    "first-encounter": reasons.has("episode"),
    "first-checkpoint": reasons.has("checkpoint"),
    "dungeon-clear": reasons.has("course-done"),
    "workshop-initiate": reasons.has("lab-task"),
    polymath: Object.values(subjectXp).every((value) => value > 0),
  };
  const now = Date.now();
  for (const definition of ACHIEVEMENTS) {
    if (!conditions[definition.id]) continue;
    db.insert(achievementUnlocks)
      .values({ userId, achievementId: definition.id, unlockedAt: now })
      .onConflictDoNothing()
      .run();
  }
  const unlocked = new Map(
    db
      .select()
      .from(achievementUnlocks)
      .where(eq(achievementUnlocks.userId, userId))
      .all()
      .map((row) => [row.achievementId, row.unlockedAt]),
  );
  return ACHIEVEMENTS.map((definition) => ({
    ...definition,
    unlocked: unlocked.has(definition.id),
    unlockedAt: unlocked.get(definition.id),
  }));
}
