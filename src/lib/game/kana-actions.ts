"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth/session";
import { db } from "../db/client";
import { xpEvents } from "../db/schema";
import { getTotalXp } from "../progress/queries";
import { levelFromXp } from "./level";
import { KANA_QUIZ_XP, XP_REASON, kanaQuizRef } from "./xp";

// 五十音图测验通关打卡。v1 信任客户端触发(纯记忆练习,无作弊收益),
// 防重复靠 (user, reason, ref) 幂等键——每套假名一次性得分。

export interface KanaQuizResult {
  ok: boolean;
  gained: number;
  levelUp: boolean;
  newLevel: number;
}

export async function completeKanaQuiz(
  script: "hira" | "kata",
): Promise<KanaQuizResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, gained: 0, levelUp: false, newLevel: 1 };

  const before = getTotalXp(user.id);
  const inserted = db
    .insert(xpEvents)
    .values({
      userId: user.id,
      amount: KANA_QUIZ_XP,
      reason: XP_REASON.kana,
      ref: kanaQuizRef(script),
      createdAt: Date.now(),
    })
    .onConflictDoNothing()
    .returning({ amount: xpEvents.amount })
    .get();

  const gained = inserted?.amount ?? 0;
  if (gained > 0) revalidatePath("/kana");
  const total = before + gained;
  return {
    ok: true,
    gained,
    levelUp: levelFromXp(total) > levelFromXp(before),
    newLevel: levelFromXp(total),
  };
}
