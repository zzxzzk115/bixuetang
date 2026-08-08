"use server";

import { getCurrentUser } from "../auth/session";
import { db } from "../db/client";
import { userState } from "../db/schema";
import { getContent } from "../content/load";

// 职业目标(成为 X)的改/清/关提示。改目标不强切地图路线——推荐卡的「下一步」
// 本就跟着目标走,硬把用户的闯关面挪走反而突兀;地图仍由用户自己选。

export interface GoalResult {
  ok: boolean;
}

export async function setGoalRoadmap(roadmapId: string): Promise<GoalResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  if (!getContent().roadmapsById.has(roadmapId)) return { ok: false };
  const now = Date.now();
  // 定/换目标 → 路线回到「跟随目标」(routeId=null),地图切到新目标当前该爬的线
  db.insert(userState)
    .values({
      userId: user.id,
      goalRoadmap: roadmapId,
      routeId: null,
      goalPromptedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userState.userId,
      set: {
        goalRoadmap: roadmapId,
        routeId: null,
        goalPromptedAt: now,
        updatedAt: now,
      },
    })
    .run();
  return { ok: true };
}

export async function clearGoalRoadmap(): Promise<GoalResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const now = Date.now();
  db.insert(userState)
    .values({ userId: user.id, goalPromptedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: userState.userId,
      set: { goalRoadmap: null, updatedAt: now },
    })
    .run();
  return { ok: true };
}

// 老用户就「成为 X」提示看过了(选了或点了以后再说),不再补弹
export async function dismissGoalPrompt(): Promise<GoalResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const now = Date.now();
  db.insert(userState)
    .values({ userId: user.id, goalPromptedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: userState.userId,
      set: { goalPromptedAt: now, updatedAt: now },
    })
    .run();
  return { ok: true };
}
