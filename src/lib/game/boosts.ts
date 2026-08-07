import "server-only";

import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { rpgInventory, xpBoosts } from "../db/schema";
import { boostedXp } from "./xp";

// 经验药水：商店购买（即时生效 / 入包备用）。
// 按「还能加成几次结算」计数而不是时间——长课单集就超过 30 分钟，
// 计时制会让药水在看完一集前就过期（用户点名的问题）。
// 章节化改造后,一次「结算」= 看完一个章节(长视频分段)或一整集
// (短视频);药水次数相应放大,单价不变——小额高频的奖励节奏
// (变率/即时反馈)比一次性大额更符合强化学习的心理曲线。

export type PotionKind = "x15" | "x3";

export interface PotionSpec {
  kind: PotionKind;
  /** 名字不带倍率——「经验药水 ×1.5」会被读成 1.5 瓶,倍率放 badge */
  title: string;
  /** 倍率徽章文案(XP ×1.5 / XP ×3) */
  badge: string;
  multiplierPct: number;
  /** 覆盖多少次结算(整集或章节) */
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
    title: "经验药水",
    badge: "XP ×1.5",
    multiplierPct: 150,
    episodes: 6,
    price: 100,
    bagPrice: 150,
    blurb: "接下来 6 次结算(整集或章节)的经验 ×1.5",
  },
  x3: {
    kind: "x3",
    title: "浓缩经验药水",
    badge: "XP ×3",
    multiplierPct: 300,
    episodes: 12,
    price: 300,
    bagPrice: 450,
    blurb: "接下来 12 次结算(整集或章节)的经验 ×3",
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

// ==== 时长型经验药水(全局按时长) ====
// 激活后一段时间内所有「学习所得 XP」×倍率(墙钟计时,跨课程/试炼/测验/复习)。
// 与按次型并存互不冲突;任务/全勤/月度奖励只发这类(按次型只在商店买)。
export type TimedPotionKind = "t30" | "t60";

export interface TimedPotionSpec {
  kind: TimedPotionKind;
  title: string;
  badge: string;
  multiplierPct: number;
  /** 持续分钟数 */
  minutes: number;
  price: number;
  bagPrice: number;
  blurb: string;
}

export const TIMED_POTIONS: Record<TimedPotionKind, TimedPotionSpec> = {
  t30: {
    kind: "t30",
    title: "急速经验药水",
    badge: "XP ×2",
    multiplierPct: 200,
    minutes: 30,
    price: 120,
    bagPrice: 180,
    blurb: "30 分钟内一切学习所得经验 ×2(跨课程/试炼/复习)",
  },
  t60: {
    kind: "t60",
    title: "悠长经验药水",
    badge: "XP ×1.5",
    multiplierPct: 150,
    minutes: 60,
    price: 150,
    bagPrice: 220,
    blurb: "60 分钟内一切学习所得经验 ×1.5(跨课程/试炼/复习)",
  },
};

export function timedPotionItemId(kind: TimedPotionKind): string {
  return `timed-${kind}`;
}

export function timedPotionKindFromItemId(
  itemId: string,
): TimedPotionKind | null {
  if (itemId === "timed-t30") return "t30";
  if (itemId === "timed-t60") return "t60";
  return null;
}

export interface ActiveTimedBoost {
  multiplierPct: number;
  /** 剩余秒数 */
  secondsLeft: number;
}

export function getTimedBoost(userId: number): ActiveTimedBoost | null {
  const row = db
    .select({
      pct: xpBoosts.timedMultiplierPct,
      exp: xpBoosts.timedExpiresAt,
    })
    .from(xpBoosts)
    .where(eq(xpBoosts.userId, userId))
    .get();
  if (!row || row.pct <= 0) return null;
  const left = row.exp - Date.now();
  if (left <= 0) return null;
  return { multiplierPct: row.pct, secondsLeft: Math.ceil(left / 1000) };
}

/** 激活时长药水:同倍率顺延到期时间,不同倍率替换并从现在起计时 */
export function activateTimedBoost(
  userId: number,
  spec: TimedPotionSpec,
): ActiveTimedBoost {
  const now = Date.now();
  const addMs = spec.minutes * 60_000;
  const cur = getTimedBoost(userId);
  const base =
    cur && cur.multiplierPct === spec.multiplierPct
      ? now + cur.secondsLeft * 1000
      : now;
  const expiresAt = base + addMs;
  db.insert(xpBoosts)
    .values({
      userId,
      multiplierPct: 0,
      episodesLeft: 0,
      timedMultiplierPct: spec.multiplierPct,
      timedExpiresAt: expiresAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: xpBoosts.userId,
      set: {
        timedMultiplierPct: spec.multiplierPct,
        timedExpiresAt: expiresAt,
        updatedAt: now,
      },
    })
    .run();
  return {
    multiplierPct: spec.multiplierPct,
    secondsLeft: Math.ceil((expiresAt - now) / 1000),
  };
}

/** 任务/全勤/月度奖励发放时长药水(入包)。qty 默认 1 */
export function grantTimedPotion(
  userId: number,
  kind: TimedPotionKind,
  qty = 1,
) {
  const now = Date.now();
  db.insert(rpgInventory)
    .values({
      userId,
      itemId: timedPotionItemId(kind),
      quantity: qty,
      acquiredAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [rpgInventory.userId, rpgInventory.itemId],
      set: { quantity: sql`${rpgInventory.quantity} + ${qty}`, updatedAt: now },
    })
    .run();
}

/** 时长药水的库存计数(入包备用) */
export function timedPotionCounts(
  userId: number,
): Record<TimedPotionKind, number> {
  const rows = db
    .select({ itemId: rpgInventory.itemId, quantity: rpgInventory.quantity })
    .from(rpgInventory)
    .where(eq(rpgInventory.userId, userId))
    .all();
  const byId = new Map(rows.map((r) => [r.itemId, r.quantity]));
  return {
    t30: byId.get(timedPotionItemId("t30")) ?? 0,
    t60: byId.get(timedPotionItemId("t60")) ?? 0,
  };
}

/**
 * 给一笔「学习所得 XP」叠加时长加成(不消耗,时长型是墙钟计时)。
 * 所有非课程结算点(试炼/测验/复习)用它;课程结算点在 settleBoostedXp
 * 里已顺带调用。取整到 5(与各处口径一致)。
 */
export function applyTimedBoost(userId: number, baseXp: number): number {
  const t = getTimedBoost(userId);
  if (!t) return baseXp;
  return Math.max(5, Math.round((baseXp * t.multiplierPct) / 100 / 5) * 5);
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
 * 结算入账：应用加成,可选消耗一次药水次数。
 * 消耗点只有「看完一整集」和「看完一个章节」(测验/宝箱/试炼不消耗
 * 也不加成);分段集的整集补差(remainder)只乘不耗。
 * roundTo:整集经验取整到 10,章节小额经验取整到 5。
 */
export function settleBoostedXp(
  userId: number,
  baseXp: number,
  opts: { consume: boolean; roundTo?: 5 | 10 } = { consume: true },
): number {
  const round = opts.roundTo ?? 10;
  const boost = getActiveBoost(userId);
  let xp = baseXp;
  if (boost) {
    if (opts.consume) {
      db.update(xpBoosts)
        .set({
          episodesLeft: sql`${xpBoosts.episodesLeft} - 1`,
          updatedAt: Date.now(),
        })
        .where(eq(xpBoosts.userId, userId))
        .run();
    }
    xp = Math.max(
      round,
      Math.round((baseXp * boost.multiplierPct) / 100 / round) * round,
    );
  }
  // 时长型加成叠加在按次型之上(全局,墙钟计时,不消耗)
  const t = getTimedBoost(userId);
  if (t) {
    xp = Math.max(
      round,
      Math.round((xp * t.multiplierPct) / 100 / round) * round,
    );
  }
  return xp;
}

/** 结算一集(兼容旧调用):应用加成并消耗一次药水次数 */
export function settleEpisodeXp(userId: number, baseXp: number): number {
  return settleBoostedXp(userId, baseXp, { consume: true, roundTo: 10 });
}
