import "server-only";

import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { episodeWatch, userState } from "../db/schema";

// 学习状态的读侧。写侧在 user-state-actions.ts。
//
// 存储划分（这条线要一直守住）：
//   数据库  = 属于「这个人」的学习状态：观看进度、当前路线、最后学到哪、
//             打卡/XP/装备/排位/绑定
//   本地存储 = 属于「这台设备」的观看偏好：音量、倍速、清晰度、
//             弹幕与字幕的显示样式

export interface LastWatched {
  courseId: string;
  episodeN: number;
  positionSec: number;
  ratioPct: number;
}

/** 通知邮件偏好(断学召回 / 学习周报),设置页用 */
export function getEmailPrefs(userId: number): {
  recall: boolean;
  weekly: boolean;
} {
  const row = db
    .select({
      emailRecall: userState.emailRecall,
      emailWeekly: userState.emailWeekly,
    })
    .from(userState)
    .where(eq(userState.userId, userId))
    .get();
  return {
    recall: row?.emailRecall === 1,
    weekly: row?.emailWeekly === 1,
  };
}

export function getUserState(userId: number): {
  routeId: string | null;
  last: LastWatched | null;
  playerPrefs: string | null;
  onboardedAt: number | null;
  goalRoadmap: string | null;
  goalPromptedAt: number | null;
} {
  const row = db
    .select()
    .from(userState)
    .where(eq(userState.userId, userId))
    .get();

  // 最后看的那一集直接从观看进度表取最新一条，省得两处状态打架
  const recent = db
    .select()
    .from(episodeWatch)
    .where(eq(episodeWatch.userId, userId))
    .orderBy(desc(episodeWatch.updatedAt))
    .limit(1)
    .get();

  return {
    routeId: row?.routeId ?? null,
    playerPrefs: row?.playerPrefs ?? null,
    onboardedAt: row?.onboardedAt ?? null,
    goalRoadmap: row?.goalRoadmap ?? null,
    goalPromptedAt: row?.goalPromptedAt ?? null,
    last: recent
      ? {
          courseId: recent.courseId,
          episodeN: recent.episodeN,
          positionSec: recent.positionSec,
          ratioPct: recent.ratioPct,
        }
      : null,
  };
}
