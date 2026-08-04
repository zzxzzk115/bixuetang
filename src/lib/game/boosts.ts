import "server-only";

import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { rpgInventory, xpBoosts } from "../db/schema";
import { boostedXp } from "./xp";

// 经验药水：商店购买（即时生效 / 入包备用）。
// 按「还能加成几集」计数而不是时间——长课单集就超过 30 分钟，
// 计时制会让药水在看完一集前就过期（用户点名的问题）。

export type PotionKind = "x15" | "x3";

export interface PotionSpec {
  kind: PotionKind;
  title: string;
  multiplierPct: number;
  /** 覆盖多少集 */
  episodes: number;
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
    episodes: 2,
    price: 100,
    bagPrice: 150,
    blurb: "接下来 2 集的完成经验 ×1.5",
  },
  x3: {
    kind: "x3",
    title: "浓缩经验药水 ×3",
    multiplierPct: 300,
    episodes: 4,
    price: 300,
    bagPrice: 450,
    blurb: "接下来 4 集的完成经验 ×3",
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
  /** 还能加成几集 */
  episodesLeft: number;
}

export function getActiveBoost(userId: number): ActiveBoost | null {
  const row = db
    .select()
    .from(xpBoosts)
    .where(eq(xpBoosts.userId, userId))
    .get();
  if (!row || row.episodesLeft <= 0) return null;
  return { multiplierPct: row.multiplierPct, episodesLeft: row.episodesLeft };
}

/** 激活/叠加药水：同倍率累加集数，不同倍率替换 */
export function activateBoost(userId: number, spec: PotionSpec): ActiveBoost {
  const now = Date.now();
  const cur = getActiveBoost(userId);
  const episodesLeft =
    cur && cur.multiplierPct === spec.multiplierPct
      ? cur.episodesLeft + spec.episodes
      : spec.episodes;
  db.insert(xpBoosts)
    .values({
      userId,
      multiplierPct: spec.multiplierPct,
      episodesLeft,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: xpBoosts.userId,
      set: { multiplierPct: spec.multiplierPct, episodesLeft, updatedAt: now },
    })
    .run();
  return { multiplierPct: spec.multiplierPct, episodesLeft };
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

/** 预览：这一集完成能拿多少 XP（含药水加成），提前告诉玩家 */
export function previewEpisodeXp(
  userId: number,
  baseXp: number,
): { base: number; final: number; multiplierPct: number } {
  const boost = getActiveBoost(userId);
  if (!boost) return { base: baseXp, final: baseXp, multiplierPct: 100 };
  return {
    base: baseXp,
    final: boostedXp(baseXp, boost.multiplierPct),
    multiplierPct: boost.multiplierPct,
  };
}

/**
 * 结算一集：应用加成并消耗一次药水次数。
 * 只有「看完一集」会消耗药水（测验/宝箱/试炼不消耗也不加成）。
 */
export function settleEpisodeXp(userId: number, baseXp: number): number {
  const boost = getActiveBoost(userId);
  if (!boost) return baseXp;
  db.update(xpBoosts)
    .set({
      episodesLeft: sql`${xpBoosts.episodesLeft} - 1`,
      updatedAt: Date.now(),
    })
    .where(eq(xpBoosts.userId, userId))
    .run();
  return boostedXp(baseXp, boost.multiplierPct);
}
