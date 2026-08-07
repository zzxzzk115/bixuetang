"use server";

import crypto from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { getCurrentUser } from "../auth/session";
import { db } from "../db/client";
import { rpgInventory, rpgProfiles } from "../db/schema";
import {
  POTIONS,
  TIMED_POTIONS,
  activateBoost,
  activateTimedBoost,
  getActiveBoost,
  getTimedBoost,
  potionCounts,
  potionItemId,
  timedPotionCounts,
  timedPotionItemId,
  type ActiveBoost,
  type ActiveTimedBoost,
  type PotionKind,
  type TimedPotionKind,
} from "./boosts";
import {
  FUSE_COUNT,
  fusableError,
  fusionResult,
  RARITY_ENCOUNTER,
  RELIC_SHOP_PRICES,
  SLOT_PRICES,
} from "./fusion";
import { MAX_EQUIP_SLOTS } from "./relics";
import { getLootItem, itemForEncounter, type LootItem } from "./rpg";
import type { Subject } from "../content/schema";

// 商店与消耗品。购买默认立即生效；入包（囤货）要加价，之后在背包里「使用」。
// 扩展玩法:装备槽扩容(3→6)、遗物直售(融合素材)、遗物融合(3合1,几率升级)。

export interface ShopResult {
  ok: boolean;
  error?: string;
  coins?: number;
  boost?: ActiveBoost | null;
  timedBoost?: ActiveTimedBoost | null;
  /** 各药水的背包存量 */
  potions?: Record<PotionKind, number>;
  timedPotions?: Record<TimedPotionKind, number>;
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
    timedBoost: getTimedBoost(userId),
    potions: potionCounts(userId),
    timedPotions: timedPotionCounts(userId),
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

/** 购买时长型药水(全局按时长):立即生效 / 入包备用 */
export async function buyTimedPotion(
  kind: TimedPotionKind,
  toBag: boolean,
): Promise<ShopResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };
  const spec = TIMED_POTIONS[kind];
  if (!spec) return { ok: false, error: "没有这种药水" };
  const price = toBag ? spec.bagPrice : spec.price;
  if (!charge(user.id, price)) return { ok: false, error: "金币不够" };
  if (toBag) addItem(user.id, timedPotionItemId(kind));
  else activateTimedBoost(user.id, spec);
  return snapshot(user.id);
}

/** 喝背包里的时长药水 */
export async function drinkTimedPotion(
  kind: TimedPotionKind,
): Promise<ShopResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };
  const spec = TIMED_POTIONS[kind];
  if (!spec) return { ok: false, error: "没有这种药水" };
  const now = Date.now();
  const used = db
    .update(rpgInventory)
    .set({ quantity: sql`${rpgInventory.quantity} - 1`, updatedAt: now })
    .where(
      and(
        eq(rpgInventory.userId, user.id),
        eq(rpgInventory.itemId, timedPotionItemId(kind)),
        gt(rpgInventory.quantity, 0),
      ),
    )
    .returning({ quantity: rpgInventory.quantity })
    .get();
  if (!used) return { ok: false, error: "背包里没有这瓶药水" };
  activateTimedBoost(user.id, spec);
  return snapshot(user.id);
}

export interface FreezeResult extends ShopResult {
  freezes?: number;
}

export async function buyStreakFreeze(): Promise<FreezeResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  const { getStreak, addFreeze, MAX_FREEZES, FREEZE_PRICE } = await import(
    "./streak-server"
  );
  if (getStreak(user.id).freezes >= MAX_FREEZES) {
    return { ok: false, error: `连胜冻结最多囤 ${MAX_FREEZES} 枚` };
  }
  const now = Date.now();
  const paid = db
    .update(rpgProfiles)
    .set({ coins: sql`${rpgProfiles.coins} - ${FREEZE_PRICE}`, updatedAt: now })
    .where(
      and(
        eq(rpgProfiles.userId, user.id),
        gt(rpgProfiles.coins, FREEZE_PRICE - 1),
      ),
    )
    .returning({ coins: rpgProfiles.coins })
    .get();
  if (!paid) return { ok: false, error: "金币不够" };

  const added = addFreeze(user.id);
  return { ...snapshot(user.id), freezes: added.freezes };
}

/** 扣款(带余额校验)。返回 false = 金币不够 */
function charge(userId: number, price: number): boolean {
  const paid = db
    .update(rpgProfiles)
    .set({ coins: sql`${rpgProfiles.coins} - ${price}`, updatedAt: Date.now() })
    .where(
      and(eq(rpgProfiles.userId, userId), gt(rpgProfiles.coins, price - 1)),
    )
    .returning({ coins: rpgProfiles.coins })
    .get();
  return !!paid;
}

function addItem(userId: number, itemId: string, delta = 1) {
  const now = Date.now();
  db.insert(rpgInventory)
    .values({ userId, itemId, quantity: delta, acquiredAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [rpgInventory.userId, rpgInventory.itemId],
      set: { quantity: sql`${rpgInventory.quantity} + ${delta}`, updatedAt: now },
    })
    .run();
}

export interface SlotResult extends ShopResult {
  equipSlots?: number;
  /** 下一个槽的价格(null=已满) */
  nextSlotPrice?: number | null;
}

/** 购买第 4/5/6 个装备槽 */
export async function buyEquipSlot(): Promise<SlotResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  const cur =
    db
      .select({ equipSlots: rpgProfiles.equipSlots })
      .from(rpgProfiles)
      .where(eq(rpgProfiles.userId, user.id))
      .get()?.equipSlots ?? 3;
  if (cur >= MAX_EQUIP_SLOTS) {
    return { ok: false, error: "装备槽已经满配了" };
  }
  const price = SLOT_PRICES[cur + 1];
  if (!price) return { ok: false, error: "槽位价格未定义" };
  if (!charge(user.id, price)) return { ok: false, error: "金币不够" };

  const next = cur + 1;
  db.update(rpgProfiles)
    .set({ equipSlots: next, updatedAt: Date.now() })
    .where(eq(rpgProfiles.userId, user.id))
    .run();
  return {
    ...snapshot(user.id),
    equipSlots: next,
    nextSlotPrice: next >= MAX_EQUIP_SLOTS ? null : SLOT_PRICES[next + 1],
  };
}

export interface RelicShopResult extends ShopResult {
  item?: LootItem;
}

/** 遗物直售:只卖 common/uncommon 当融合素材,高稀有度得自己学出来 */
export async function buyRelic(
  subject: Subject,
  rarity: "common" | "uncommon",
): Promise<RelicShopResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };
  const price = RELIC_SHOP_PRICES[rarity];
  if (!price) return { ok: false, error: "商店不卖这种稀有度" };
  const item = itemForEncounter(subject, RARITY_ENCOUNTER[rarity]);
  if (!item) return { ok: false, error: "没有这种遗物" };
  if (!charge(user.id, price)) return { ok: false, error: "金币不够" };
  addItem(user.id, item.id);
  return { ...snapshot(user.id), item };
}

export interface FusionActionResult extends ShopResult {
  item?: LootItem;
  upgraded?: boolean;
}

/** 遗物融合:三件同稀有度 → 一件(几率升一级);学科随机继承自输入 */
export async function fuseRelics(
  itemIds: string[],
): Promise<FusionActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };
  if (!Array.isArray(itemIds) || itemIds.length !== FUSE_COUNT) {
    return { ok: false, error: `融合需要恰好 ${FUSE_COUNT} 件遗物` };
  }
  const inputs: LootItem[] = [];
  for (const id of itemIds) {
    const item = getLootItem(id);
    if (!item) return { ok: false, error: "有一件不是遗物" };
    inputs.push(item);
  }
  const invalid = fusableError(inputs);
  if (invalid) return { ok: false, error: invalid };

  // 按 id 聚合需求量,事务里逐一扣减(带存量校验),不足则整体回滚
  const need = new Map<string, number>();
  for (const id of itemIds) need.set(id, (need.get(id) ?? 0) + 1);

  const outcome = fusionResult(
    inputs,
    crypto.randomInt(1_000_000) / 1_000_000,
    crypto.randomInt(1_000_000) / 1_000_000,
  );

  try {
    db.transaction((tx) => {
      const now = Date.now();
      for (const [id, qty] of need) {
        const used = tx
          .update(rpgInventory)
          .set({
            quantity: sql`${rpgInventory.quantity} - ${qty}`,
            updatedAt: now,
          })
          .where(
            and(
              eq(rpgInventory.userId, user.id),
              eq(rpgInventory.itemId, id),
              gt(rpgInventory.quantity, qty - 1),
            ),
          )
          .returning({ quantity: rpgInventory.quantity })
          .get();
        if (!used) throw new Error("遗物数量不够");
      }
      tx.insert(rpgInventory)
        .values({
          userId: user.id,
          itemId: outcome.item.id,
          quantity: 1,
          acquiredAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [rpgInventory.userId, rpgInventory.itemId],
          set: {
            quantity: sql`${rpgInventory.quantity} + 1`,
            updatedAt: now,
          },
        })
        .run();
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "融合失败",
    };
  }

  return { ...snapshot(user.id), item: outcome.item, upgraded: outcome.upgraded };
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
