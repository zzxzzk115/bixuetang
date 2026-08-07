import "server-only";

import { and, eq, lt, sql, sum } from "drizzle-orm";
import { getContent } from "../content/load";
import type { Course } from "../content/schema";
import { db } from "../db/client";
import {
  checkpointAttempts,
  episodeProgress,
  learningSessions,
  rpgEquipment,
  rpgInventory,
  rpgLootEvents,
  rpgProfiles,
  xpEvents,
} from "../db/schema";
import { levelFromXp } from "./level";
import {
  equipmentBonus,
  MAX_SHIELD_HEARTS,
  SHIELD_DROP_CHANCE,
  type StatBlock,
} from "./relics";
import {
  getLootItem,
  lootForEpisode,
  luckyBonusCoins,
  type EpisodeLoot,
  type LootItem,
} from "./rpg";

export interface InventoryEntry {
  item: LootItem;
  quantity: number;
}

export interface EquippedEntry {
  slot: number;
  item: LootItem;
  quantity: number;
}

export interface RpgProfile {
  coins: number;
  /** 已解锁的装备槽数(默认 3,商店扩容) */
  equipSlots: number;
  /** 护盾血(蓝心)持有数 */
  shieldHearts: number;
  relics: InventoryEntry[];
  equipped: EquippedEntry[];
  /** 学习行为攒出来的底子 */
  baseStats: StatBlock;
  /** 装备栏加成（随持有数量按 log2 堆叠，见 relics.ts） */
  bonusStats: StatBlock;
  /** base + bonus 合计（旧调用方继续用这个形状） */
  stats: {
    insight: number;
    focus: number;
    precision: number;
    resolve: number;
    power: number;
  };
}

export function settleEpisodeLoot(
  userId: number,
  course: Course,
  episodeN: number,
): EpisodeLoot | null {
  const reward = lootForEpisode(
    course.subject,
    course.level,
    episodeN,
    course.episodes.length,
  );
  // 幸运彩蛋只随掉落事件结算一次(loot 事件主键幂等),重勾刷不出第二份
  reward.luckyCoins = luckyBonusCoins(userId, course.id, episodeN);
  const totalCoins = reward.coins + reward.luckyCoins;
  const now = Date.now();

  return db.transaction((tx) => {
    const inserted = tx
      .insert(rpgLootEvents)
      .values({
        userId,
        courseId: course.id,
        episodeN,
        encounterType: reward.encounterType,
        coins: totalCoins,
        itemId: reward.item.id,
        rarity: reward.item.rarity,
        ruleVersion: reward.ruleVersion,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ episodeN: rpgLootEvents.episodeN })
      .get();

    if (!inserted) return null;

    tx.insert(rpgProfiles)
      .values({ userId, coins: totalCoins, updatedAt: now })
      .onConflictDoUpdate({
        target: rpgProfiles.userId,
        set: {
          coins: sql`${rpgProfiles.coins} + ${totalCoins}`,
          updatedAt: now,
        },
      })
      .run();

    tx.insert(rpgInventory)
      .values({
        userId,
        itemId: reward.item.id,
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

    return reward;
  });
}

/**
 * 学习结算时按概率掉一颗护盾血(蓝心),满则不掉。返回是否掉落。
 * 幂等性由调用点保证(在「首次入账」分支里调,重看同一集不重掷)。
 */
export function tryDropShieldHeart(
  userId: number,
  chance = SHIELD_DROP_CHANCE,
): boolean {
  if (Math.random() >= chance) return false;
  const now = Date.now();
  const updated = db
    .update(rpgProfiles)
    .set({
      shieldHearts: sql`${rpgProfiles.shieldHearts} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(rpgProfiles.userId, userId),
        lt(rpgProfiles.shieldHearts, MAX_SHIELD_HEARTS),
      ),
    )
    .returning({ shieldHearts: rpgProfiles.shieldHearts })
    .get();
  return !!updated;
}

/** 试炼结束后回写剩余护盾血(消耗掉的蓝心不再回来) */
export function setShieldHearts(userId: number, value: number) {
  const v = Math.max(0, Math.min(MAX_SHIELD_HEARTS, Math.round(value)));
  db.update(rpgProfiles)
    .set({ shieldHearts: v, updatedAt: Date.now() })
    .where(eq(rpgProfiles.userId, userId))
    .run();
}

function syncRpgLootForProgress(userId: number) {
  const settled = new Set(
    db
      .select({ courseId: rpgLootEvents.courseId, episodeN: rpgLootEvents.episodeN })
      .from(rpgLootEvents)
      .where(eq(rpgLootEvents.userId, userId))
      .all()
      .map((row) => `${row.courseId}:${row.episodeN}`),
  );
  const watched = db
    .select({ courseId: episodeProgress.courseId, episodeN: episodeProgress.episodeN })
    .from(episodeProgress)
    .where(eq(episodeProgress.userId, userId))
    .all();
  const courses = getContent().coursesById;
  for (const row of watched) {
    if (settled.has(`${row.courseId}:${row.episodeN}`)) continue;
    const course = courses.get(row.courseId);
    if (course) settleEpisodeLoot(userId, course, row.episodeN);
  }
}

export function getRpgProfile(userId: number): RpgProfile {
  syncRpgLootForProgress(userId);
  const profile = db
    .select({
      coins: rpgProfiles.coins,
      equipSlots: rpgProfiles.equipSlots,
      shieldHearts: rpgProfiles.shieldHearts,
    })
    .from(rpgProfiles)
    .where(eq(rpgProfiles.userId, userId))
    .get();
  const equipSlots = profile?.equipSlots ?? 3;
  const shieldHearts = profile?.shieldHearts ?? 0;
  const inventory = db
    .select()
    .from(rpgInventory)
    .where(eq(rpgInventory.userId, userId))
    .all();

  const episodeCount = db
    .select({ n: episodeProgress.episodeN })
    .from(episodeProgress)
    .where(eq(episodeProgress.userId, userId))
    .all().length;
  const passedCount = db
    .select({ id: checkpointAttempts.checkpointId })
    .from(checkpointAttempts)
    .where(
      and(
        eq(checkpointAttempts.userId, userId),
        eq(checkpointAttempts.passed, true),
      ),
    )
    .all().length;
  const focusRow = db
    .select({ total: sum(learningSessions.focusMinutes) })
    .from(learningSessions)
    .where(eq(learningSessions.userId, userId))
    .get();
  const xpRow = db
    .select({ total: sum(xpEvents.amount) })
    .from(xpEvents)
    .where(eq(xpEvents.userId, userId))
    .get();

  // 技能树退役后洞察只看等级：原本还加技能点数，那套加点玩法已经删了
  const insight = 5 + levelFromXp(Number(xpRow?.total ?? 0)) * 2;
  const focus = 5 + Math.floor(Number(focusRow?.total ?? 0) / 30);
  const precision = 5 + Math.floor(episodeCount / 5);
  const resolve = 5 + passedCount * 2;
  const baseStats: StatBlock = { insight, focus, precision, resolve };

  const relics = inventory
    .map((row) => {
      const item = getLootItem(row.itemId);
      return item ? { item, quantity: row.quantity } : null;
    })
    .filter((entry): entry is InventoryEntry => entry !== null);

  const quantityById = new Map(relics.map((r) => [r.item.id, r.quantity]));
  const equipped: EquippedEntry[] = db
    .select()
    .from(rpgEquipment)
    .where(eq(rpgEquipment.userId, userId))
    .all()
    .map((row) => {
      const item = getLootItem(row.itemId);
      const quantity = quantityById.get(row.itemId) ?? 0;
      // 内容删除或数量归零的孤儿装备：读时忽略
      return item && quantity > 0 ? { slot: row.slot, item, quantity } : null;
    })
    .filter((e): e is EquippedEntry => e !== null)
    .sort((a, b) => a.slot - b.slot);

  const bonusStats = equipmentBonus(equipped, equipSlots);

  return {
    coins: profile?.coins ?? 0,
    equipSlots,
    shieldHearts,
    relics,
    equipped,
    baseStats,
    bonusStats,
    stats: {
      insight: insight + bonusStats.insight,
      focus: focus + bonusStats.focus,
      precision: precision + bonusStats.precision,
      resolve: resolve + bonusStats.resolve,
      power:
        insight + focus + precision + resolve +
        bonusStats.insight + bonusStats.focus +
        bonusStats.precision + bonusStats.resolve,
    },
  };
}
