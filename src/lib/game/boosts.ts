import "server-only";

import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { rpgInventory, xpBoosts } from "../db/schema";

// 经验药水：商店购买（即时生效 / 入包备用），XP 结算统一走 boostXp。
// 规则：同倍率续时长（从当前到期点顺延），不同倍率直接替换（用户拍板即所欲）。

export type PotionKind = "x15" | "x3";

export interface PotionSpec {
  kind: PotionKind;
  title: string;
  multiplierPct: number;
  durationMs: number;
  /** 立即生效价 */
  price: number;
  /** 放入背包价（囤货要加钱） */
  bagPrice: number;
  blurb: string;
}

export const POTIONS: Record<PotionKind, PotionSpec> = {
  x15: {
    kind: "x15",
    title: "经验药水 ×1.5",
    multiplierPct: 150,
    durationMs: 30 * 60 * 1000,
    price: 100,
    bagPrice: 150,
    blurb: "30 分钟内所有学习 XP ×1.5",
  },
  x3: {
    kind: "x3",
    title: "浓缩经验药水 ×3",
    multiplierPct: 300,
    durationMs: 30 * 60 * 1000,
    price: 300,
    bagPrice: 450,
    blurb: "30 分钟内所有学习 XP ×3",
  },
};

/** 背包/库存里消耗品的 itemId（与遗物共用 rpg_inventory，按前缀区分） */
export function potionItemId(kind: PotionKind): string {
  return `potion-${kind}`;
}

export function potionKindFromItemId(itemId: string): PotionKind | null {
  if (itemId === "potion-x15") return "x15";
  if (itemId === "potion-x3") return "x3";
  return null;
}

export interface ActiveBoost {
  multiplierPct: number;
  expiresAt: number;
}

export function getActiveBoost(userId: number): ActiveBoost | null {
  const row = db
    .select()
    .from(xpBoosts)
    .where(eq(xpBoosts.userId, userId))
    .get();
  if (!row || row.expiresAt <= Date.now()) return null;
  return { multiplierPct: row.multiplierPct, expiresAt: row.expiresAt };
}

/** 激活/续期加成：同倍率顺延，不同倍率替换 */
export function activateBoost(userId: number, spec: PotionSpec): ActiveBoost {
  const now = Date.now();
  const cur = getActiveBoost(userId);
  const expiresAt =
    cur && cur.multiplierPct === spec.multiplierPct
      ? cur.expiresAt + spec.durationMs
      : now + spec.durationMs;
  db.insert(xpBoosts)
    .values({
      userId,
      multiplierPct: spec.multiplierPct,
      expiresAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: xpBoosts.userId,
      set: { multiplierPct: spec.multiplierPct, expiresAt, updatedAt: now },
    })
    .run();
  return { multiplierPct: spec.multiplierPct, expiresAt };
}

/** 背包里各药水的存量 */
export function potionCounts(userId: number): Record<PotionKind, number> {
  const rows = db
    .select({ itemId: rpgInventory.itemId, quantity: rpgInventory.quantity })
    .from(rpgInventory)
    .where(eq(rpgInventory.userId, userId))
    .all();
  const byId = new Map(rows.map((r) => [r.itemId, r.quantity]));
  return {
    x15: byId.get(potionItemId("x15")) ?? 0,
    x3: byId.get(potionItemId("x3")) ?? 0,
  };
}

/** XP 结算入口：有生效中的药水就乘上去（金币不受加成） */
export function boostXp(userId: number, base: number): number {
  if (base <= 0) return base;
  const boost = getActiveBoost(userId);
  if (!boost) return base;
  return Math.round((base * boost.multiplierPct) / 100);
}
