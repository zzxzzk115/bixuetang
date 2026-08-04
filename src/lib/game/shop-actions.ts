"use server";

import { and, eq, gt, sql } from "drizzle-orm";
import { getCurrentUser } from "../auth/session";
import { db } from "../db/client";
import { rpgInventory, rpgProfiles } from "../db/schema";
import {
  POTIONS,
  activateBoost,
  getActiveBoost,
  potionCounts,
  potionItemId,
  type ActiveBoost,
  type PotionKind,
} from "./boosts";

// 商店与消耗品。购买默认立即生效；入包（囤货）要加价，之后在背包里「使用」。

export interface ShopResult {
  ok: boolean;
  error?: string;
  coins?: number;
  boost?: ActiveBoost | null;
  /** 各药水的背包存量 */
  potions?: Record<PotionKind, number>;
}

function snapshot(userId: number): ShopResult {
  const coins =
    db
      .select({ coins: rpgProfiles.coins })
      .from(rpgProfiles)
      .where(eq(rpgProfiles.userId, userId))
      .get()?.coins ?? 0;
  return {
    ok: true,
    coins,
    boost: getActiveBoost(userId),
    potions: potionCounts(userId),
  };
}

export async function buyPotion(
  kind: PotionKind,
  toBag: boolean,
): Promise<ShopResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };
  const spec = POTIONS[kind];
  if (!spec) return { ok: false, error: "没有这种药水" };

  const price = toBag ? spec.bagPrice : spec.price;
  const now = Date.now();
  // 扣款带余额校验：只在 coins ≥ price 时更新，改不到行 = 余额不足
  const paid = db
    .update(rpgProfiles)
    .set({ coins: sql`${rpgProfiles.coins} - ${price}`, updatedAt: now })
    .where(
      and(eq(rpgProfiles.userId, user.id), gt(rpgProfiles.coins, price - 1)),
    )
    .returning({ coins: rpgProfiles.coins })
    .get();
  if (!paid) return { ok: false, error: "金币不够" };

  if (toBag) {
    db.insert(rpgInventory)
      .values({
        userId: user.id,
        itemId: potionItemId(kind),
        quantity: 1,
        acquiredAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [rpgInventory.userId, rpgInventory.itemId],
        set: { quantity: sql`${rpgInventory.quantity} + 1`, updatedAt: now },
      })
      .run();
  } else {
    activateBoost(user.id, spec);
  }

  return snapshot(user.id);
}

export async function drinkPotion(kind: PotionKind): Promise<ShopResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };
  const spec = POTIONS[kind];
  if (!spec) return { ok: false, error: "没有这种药水" };

  const now = Date.now();
  // 扣存量带校验：quantity ≥ 1 才减
  const used = db
    .update(rpgInventory)
    .set({ quantity: sql`${rpgInventory.quantity} - 1`, updatedAt: now })
    .where(
      and(
        eq(rpgInventory.userId, user.id),
        eq(rpgInventory.itemId, potionItemId(kind)),
        gt(rpgInventory.quantity, 0),
      ),
    )
    .returning({ quantity: rpgInventory.quantity })
    .get();
  if (!used) return { ok: false, error: "背包里没有这瓶药水" };

  activateBoost(user.id, spec);
  return snapshot(user.id);
}
