"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth/session";
import { db } from "../db/client";
import { userState } from "../db/schema";
import { GOAL_OPTIONS } from "./daily-goal";

export async function setDailyGoal(goal: number): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const g = (GOAL_OPTIONS as readonly number[]).includes(goal) ? goal : 50;
  const now = Date.now();
  db.insert(userState)
    .values({ userId: user.id, dailyGoal: g, updatedAt: now })
    .onConflictDoUpdate({
      target: userState.userId,
      set: { dailyGoal: g, updatedAt: now },
    })
    .run();
  revalidatePath("/play/trial");
  revalidatePath("/play");
  return { ok: true };
}
