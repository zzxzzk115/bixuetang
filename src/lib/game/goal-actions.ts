"use server";

import { desc, eq } from "drizzle-orm";
import { getCurrentAdmin } from "../admin/session";
import { getCurrentUser } from "../auth/session";
import { db } from "../db/client";
import { careerSuggestions, users, userState } from "../db/schema";
import { getContent } from "../content/load";
import { containsSensitive } from "../moderation/filter";

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

// 目标选「其他」:记下用户想成为的角色(供运营考虑新增路线),并进入
// 「暂时随便逛逛」——目标留空、路线自由;同样标记已提示不再补弹。
export async function suggestCareer(
  text: string,
): Promise<GoalResult & { error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const t = text.trim().slice(0, 100);
  if (!t) return { ok: false, error: "写点你想成为什么吧" };
  if (containsSensitive(t))
    return { ok: false, error: "内容含有不当词汇,换个说法" };
  const now = Date.now();
  db.insert(careerSuggestions)
    .values({ userId: user.id, text: t, createdAt: now })
    .run();
  db.insert(userState)
    .values({ userId: user.id, goalPromptedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: userState.userId,
      set: { goalPromptedAt: now, goalRoadmap: null, updatedAt: now },
    })
    .run();
  return { ok: true };
}

export interface CareerSuggestionRow {
  id: number;
  text: string;
  username: string;
  resolved: boolean;
  createdAt: number;
}

// 管理端:列出职业建议(未处理在前、按时间倒序)
export async function listCareerSuggestions(): Promise<
  CareerSuggestionRow[] | null
> {
  const admin = await getCurrentAdmin();
  if (!admin) return null;
  return db
    .select({
      id: careerSuggestions.id,
      text: careerSuggestions.text,
      username: users.username,
      resolved: careerSuggestions.resolved,
      createdAt: careerSuggestions.createdAt,
    })
    .from(careerSuggestions)
    .innerJoin(users, eq(users.id, careerSuggestions.userId))
    .orderBy(careerSuggestions.resolved, desc(careerSuggestions.createdAt))
    .all();
}

export async function setCareerSuggestionResolved(
  id: number,
  resolved: boolean,
): Promise<GoalResult> {
  const admin = await getCurrentAdmin();
  if (!admin) return { ok: false };
  if (!Number.isInteger(id)) return { ok: false };
  db.update(careerSuggestions)
    .set({ resolved })
    .where(eq(careerSuggestions.id, id))
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
