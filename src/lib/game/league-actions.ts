"use server";

import { eq } from "drizzle-orm";
import { getCurrentUser } from "../auth/session";
import { db } from "../db/client";
import { leagueStanding } from "../db/schema";

// 确认上次段位结算横幅:清掉待展示的结算结果,横幅只弹一次。
export async function ackLeagueResult(): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  db.update(leagueStanding)
    .set({ pendingResult: null, pendingFromTier: null, pendingToTier: null })
    .where(eq(leagueStanding.userId, user.id))
    .run();
  return { ok: true };
}
