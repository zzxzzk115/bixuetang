"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth/session";
import { db } from "../db/client";
import { achievementUnlocks, rpgProfiles } from "../db/schema";
import { TIER_META } from "./achievements";

/** 领取所有「已解锁但没领」的成就等级:发对应金币,标记已领取(事务内一次做完,防重复)。 */
export async function claimAchievements(): Promise<{
  ok: boolean;
  claimed: number;
  coins: number;
}> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, claimed: 0, coins: 0 };

  return db.transaction((tx) => {
    const pending = tx
      .select({ id: achievementUnlocks.achievementId })
      .from(achievementUnlocks)
      .where(
        and(eq(achievementUnlocks.userId, user.id), isNull(achievementUnlocks.claimedAt)),
      )
      .all();
    if (pending.length === 0) return { ok: true, claimed: 0, coins: 0 };

    // 奖励 = 各等级 reward 之和(成就 id 形如 轨.等级下标)
    let coins = 0;
    for (const p of pending) {
      const idx = Number(p.id.split(".")[1]);
      const meta = TIER_META[Math.min(Math.max(idx, 0), TIER_META.length - 1)];
      coins += meta.reward;
    }

    const now = Date.now();
    tx.update(achievementUnlocks)
      .set({ claimedAt: now })
      .where(
        and(eq(achievementUnlocks.userId, user.id), isNull(achievementUnlocks.claimedAt)),
      )
      .run();
    tx.insert(rpgProfiles)
      .values({ userId: user.id, coins, updatedAt: now })
      .onConflictDoUpdate({
        target: rpgProfiles.userId,
        set: { coins: sql`${rpgProfiles.coins} + ${coins}`, updatedAt: now },
      })
      .run();

    revalidatePath("/achievements");
    revalidatePath("/social");
    return { ok: true, claimed: pending.length, coins };
  });
}
