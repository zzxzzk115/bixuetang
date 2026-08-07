"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth/session";
import { getContent } from "../content/load";
import { db } from "../db/client";
import { xpEvents } from "../db/schema";
import { getTotalXp } from "../progress/queries";
import { applyTimedBoost } from "./boosts";
import { levelFromXp } from "./level";
import { recordActivity } from "./streak-server";
import { XP_REASON, shadowRef } from "./xp";
import { SHADOW_XP } from "./shadow";

export interface ShadowResult {
  ok: boolean;
  error?: string;
  /** 本次入账 XP(重复练完为 0) */
  gained?: number;
  already?: boolean;
  levelUp?: boolean;
  newLevel?: number;
}

/**
 * 练完一个影子跟读单元:发一笔 XP(幂等,首次练完才有),记当日活跃(连胜)。
 * 「练完」由前端判定(每句都录过音),v1 信任上报,防刷靠 xp_events 唯一键。
 */
export async function completeShadowUnit(
  unitId: string,
): Promise<ShadowResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  const unit = getContent().shadowUnitsById.get(unitId);
  if (!unit) return { ok: false, error: "单元不存在" };

  const before = getTotalXp(user.id);
  // 时长药水对跟读所得也生效(全局)
  const amount = applyTimedBoost(user.id, SHADOW_XP);
  const inserted = db
    .insert(xpEvents)
    .values({
      userId: user.id,
      amount,
      reason: XP_REASON.shadow,
      ref: shadowRef(unitId),
      createdAt: Date.now(),
    })
    .onConflictDoNothing()
    .returning({ amount: xpEvents.amount })
    .get();

  const gained = inserted?.amount ?? 0;
  if (gained > 0) {
    recordActivity(user.id);
    revalidatePath("/play");
  }
  const total = before + gained;
  return {
    ok: true,
    gained,
    already: gained === 0,
    levelUp: levelFromXp(total) > levelFromXp(before),
    newLevel: levelFromXp(total),
  };
}
