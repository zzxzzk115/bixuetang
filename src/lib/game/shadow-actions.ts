"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getCurrentUser } from "../auth/session";
import { getContent } from "../content/load";
import { db } from "../db/client";
import { rpgProfiles, xpEvents } from "../db/schema";
import { getTotalXp } from "../progress/queries";
import { applyTimedBoost } from "./boosts";
import { levelFromXp } from "./level";
import { recordActivity } from "./streak-server";
import { XP_REASON, shadowSegRef, shadowChestRef } from "./xp";
import { SHADOW_SEG_XP, SHADOW_CHEST_COINS, SHADOW_CHEST_XP } from "./shadow";
import { shadowSegCount } from "./shadow-track";

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
 * 练完一个跟读段(单元内第 seg 个跟读节点):发一笔 XP(幂等,首次才有),
 * 记当日活跃(连胜)。「练完」由前端判定(该段每句都录过音),v1 信任上报,
 * 防刷靠 xp_events 唯一键。
 */
export async function completeShadowSegment(
  unitId: string,
  seg: number,
): Promise<ShadowResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  const unit = getContent().shadowUnitsById.get(unitId);
  if (!unit) return { ok: false, error: "单元不存在" };
  if (seg < 0 || seg >= shadowSegCount(unit.sentences.length))
    return { ok: false, error: "段不存在" };

  const before = getTotalXp(user.id);
  const amount = applyTimedBoost(user.id, SHADOW_SEG_XP);
  const inserted = db
    .insert(xpEvents)
    .values({
      userId: user.id,
      amount,
      reason: XP_REASON.shadow,
      ref: shadowSegRef(unitId, seg),
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

export interface ShadowChestResult {
  ok: boolean;
  error?: string;
  coins?: number;
  gained?: number;
  already?: boolean;
}

/** 开跟读单元宝箱:前提是该单元每一段都练完;奖励金币 + XP,幂等 */
export async function openShadowChest(
  unitId: string,
): Promise<ShadowChestResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  const unit = getContent().shadowUnitsById.get(unitId);
  if (!unit) return { ok: false, error: "单元不存在" };

  const segTotal = shadowSegCount(unit.sentences.length);
  const doneRefs = new Set(
    db
      .select({ ref: xpEvents.ref })
      .from(xpEvents)
      .where(
        and(
          eq(xpEvents.userId, user.id),
          eq(xpEvents.reason, XP_REASON.shadow),
          inArray(
            xpEvents.ref,
            Array.from({ length: segTotal }, (_, i) => shadowSegRef(unitId, i)),
          ),
        ),
      )
      .all()
      .map((r) => r.ref),
  );
  if (doneRefs.size < segTotal)
    return { ok: false, error: "还有段没练完" };

  const now = Date.now();
  const inserted = db
    .insert(xpEvents)
    .values({
      userId: user.id,
      amount: SHADOW_CHEST_XP,
      reason: "chest",
      ref: shadowChestRef(unitId),
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ amount: xpEvents.amount })
    .get();
  if (!inserted) return { ok: true, already: true, coins: 0, gained: 0 };

  db.insert(rpgProfiles)
    .values({ userId: user.id, coins: SHADOW_CHEST_COINS, updatedAt: now })
    .onConflictDoUpdate({
      target: rpgProfiles.userId,
      set: {
        coins: sql`${rpgProfiles.coins} + ${SHADOW_CHEST_COINS}`,
        updatedAt: now,
      },
    })
    .run();

  revalidatePath("/play");
  return { ok: true, coins: SHADOW_CHEST_COINS, gained: SHADOW_CHEST_XP };
}
