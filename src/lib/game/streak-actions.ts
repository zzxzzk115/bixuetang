"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth/session";
import { db } from "../db/client";
import { rpgProfiles } from "../db/schema";
import {
  applyStreakRepair,
  getStreakRepair,
} from "./streak-server";

// 连胜修复:断掉后限时窗口内,花金币把连胜补回。

export interface RepairResult {
  ok: boolean;
  error?: string;
  restored?: number;
  cost?: number;
}

export async function repairStreak(): Promise<RepairResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  const info = getStreakRepair(user.id);
  if (!info.available) return { ok: false, error: "现在没有可修复的连胜" };

  const prof = db
    .select({ coins: rpgProfiles.coins })
    .from(rpgProfiles)
    .where(eq(rpgProfiles.userId, user.id))
    .get();
  const coins = prof?.coins ?? 0;
  if (coins < info.cost) {
    return { ok: false, error: `金币不够,修复需要 ${info.cost} 金币` };
  }

  const now = Date.now();
  db.transaction((tx) => {
    tx.update(rpgProfiles)
      .set({ coins: sql`${rpgProfiles.coins} - ${info.cost}`, updatedAt: now })
      .where(eq(rpgProfiles.userId, user.id))
      .run();
    applyStreakRepair(user.id, info.lostStreak);
  });

  revalidatePath("/play/trial");
  revalidatePath("/play");
  revalidatePath("/me");
  return { ok: true, restored: info.lostStreak, cost: info.cost };
}
