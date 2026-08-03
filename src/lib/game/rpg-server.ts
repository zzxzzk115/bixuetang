import "server-only";

import { and, eq, sql, sum } from "drizzle-orm";
import { getContent } from "../content/load";
import type { Course } from "../content/schema";
import { db } from "../db/client";
import {
  checkpointAttempts,
  episodeProgress,
  learningSessions,
  rpgInventory,
  rpgLootEvents,
  rpgProfiles,
  skillUnlocks,
  xpEvents,
} from "../db/schema";
import { levelFromXp } from "./level";
import {
  getLootItem,
  lootForEpisode,
  type EpisodeLoot,
  type LootItem,
} from "./rpg";

export interface InventoryEntry {
  item: LootItem;
  quantity: number;
}

export interface RpgProfile {
  coins: number;
  relics: InventoryEntry[];
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
  const now = Date.now();

  return db.transaction((tx) => {
    const inserted = tx
      .insert(rpgLootEvents)
      .values({
        userId,
        courseId: course.id,
        episodeN,
        encounterType: reward.encounterType,
        coins: reward.coins,
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
      .values({ userId, coins: reward.coins, updatedAt: now })
      .onConflictDoUpdate({
        target: rpgProfiles.userId,
        set: {
          coins: sql`${rpgProfiles.coins} + ${reward.coins}`,
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
    .select({ coins: rpgProfiles.coins })
    .from(rpgProfiles)
    .where(eq(rpgProfiles.userId, userId))
    .get();
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
  const skillCount = db
    .select({ id: skillUnlocks.skillId })
    .from(skillUnlocks)
    .where(eq(skillUnlocks.userId, userId))
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

  const insight = 5 + levelFromXp(Number(xpRow?.total ?? 0)) * 2 + skillCount;
  const focus = 5 + Math.floor(Number(focusRow?.total ?? 0) / 30);
  const precision = 5 + Math.floor(episodeCount / 5);
  const resolve = 5 + passedCount * 2;

  return {
    coins: profile?.coins ?? 0,
    relics: inventory
      .map((row) => {
        const item = getLootItem(row.itemId);
        return item ? { item, quantity: row.quantity } : null;
      })
      .filter((entry): entry is InventoryEntry => entry !== null),
    stats: {
      insight,
      focus,
      precision,
      resolve,
      power: insight + focus + precision + resolve,
    },
  };
}
