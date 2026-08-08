"use server";

import { eq, sql } from "drizzle-orm";
import { getCurrentUser } from "../auth/session";
import { db } from "../db/client";
import { rpgProfiles, userState } from "../db/schema";

// 首次运行引导的收尾:选好起步路线(可选)、发启程礼包、置 onboarded 标记。
// 幂等——只在 onboarded_at 为空时发礼包,防重复领(刷新/并发)。

const WELCOME_COINS = 200;

export interface OnboardingResult {
  ok: boolean;
  coins?: number;
}

export async function completeOnboarding(
  opts: { pathId?: string | null; goalRoadmap?: string | null } = {},
): Promise<OnboardingResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const now = Date.now();

  // 已引导过则不重复发礼包,只兜底把选择存上(若给了)
  const existing = db
    .select({ onboardedAt: userState.onboardedAt })
    .from(userState)
    .where(eq(userState.userId, user.id))
    .get();
  const already = existing?.onboardedAt != null;

  const routeId =
    typeof opts.pathId === "string" && opts.pathId ? opts.pathId : null;
  const goalRoadmap =
    typeof opts.goalRoadmap === "string" && opts.goalRoadmap
      ? opts.goalRoadmap
      : null;
  db.insert(userState)
    .values({
      userId: user.id,
      routeId,
      goalRoadmap,
      onboardedAt: now,
      // 走过本版引导就算「见过成为 X 目标」,老用户补弹的提示不再对其触发
      goalPromptedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userState.userId,
      set: {
        // 选了才覆盖;跳过(随便逛逛)不动已有的路线/目标
        ...(routeId ? { routeId } : {}),
        ...(goalRoadmap ? { goalRoadmap } : {}),
        onboardedAt: now,
        goalPromptedAt: now,
        updatedAt: now,
      },
    })
    .run();

  if (already) return { ok: true };

  // 启程礼包:金币,让新人第一步就有正反馈(rpg_profiles 不存在则建行)
  db.insert(rpgProfiles)
    .values({ userId: user.id, coins: WELCOME_COINS, updatedAt: now })
    .onConflictDoUpdate({
      target: rpgProfiles.userId,
      set: {
        coins: sql`${rpgProfiles.coins} + ${WELCOME_COINS}`,
        updatedAt: now,
      },
    })
    .run();

  return { ok: true, coins: WELCOME_COINS };
}
