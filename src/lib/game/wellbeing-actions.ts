"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth/session";
import { db } from "../db/client";
import { userState } from "../db/schema";
import { dayKey } from "./day";

// 人性化开关:静心模式(关竞争)与请假(连胜不因缺勤中断)。都存 user_state。

export interface Wellbeing {
  calmMode: boolean;
  vacationUntil: string | null;
}

function ensureRow(userId: number) {
  db.insert(userState)
    .values({ userId, updatedAt: Date.now() })
    .onConflictDoNothing()
    .run();
}

export async function getWellbeing(): Promise<Wellbeing> {
  const user = await getCurrentUser();
  if (!user) return { calmMode: false, vacationUntil: null };
  const row = db
    .select({ calmMode: userState.calmMode, vacationUntil: userState.vacationUntil })
    .from(userState)
    .where(eq(userState.userId, user.id))
    .get();
  return {
    calmMode: !!row?.calmMode,
    vacationUntil: row?.vacationUntil ?? null,
  };
}

export async function setCalmMode(on: boolean): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  ensureRow(user.id);
  db.update(userState)
    .set({ calmMode: on ? 1 : 0, updatedAt: Date.now() })
    .where(eq(userState.userId, user.id))
    .run();
  revalidatePath("/play/trial");
  revalidatePath("/settings");
  return { ok: true };
}

/** 请假到「今天起 days 天后」那一天(含)。days 上限 60,防误设太久。 */
export async function setVacation(days: number): Promise<{ ok: boolean; until?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const d = Math.max(1, Math.min(60, Math.floor(days)));
  const until = dayKey(Date.now() + d * 86_400_000);
  ensureRow(user.id);
  db.update(userState)
    .set({ vacationUntil: until, updatedAt: Date.now() })
    .where(eq(userState.userId, user.id))
    .run();
  revalidatePath("/settings");
  return { ok: true, until };
}

export async function cancelVacation(): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  db.update(userState)
    .set({ vacationUntil: null, updatedAt: Date.now() })
    .where(eq(userState.userId, user.id))
    .run();
  revalidatePath("/settings");
  return { ok: true };
}
