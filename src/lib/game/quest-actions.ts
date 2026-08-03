"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { questInstances, xpEvents } from "@/lib/db/schema";
import { getDailyQuests } from "@/lib/game/quests";
import { levelFromXp } from "@/lib/game/level";
import { getTotalXp } from "@/lib/progress/queries";

export async function claimDailyQuest(questId: number): Promise<{
  ok: boolean;
  error?: string;
  gained?: number;
  levelUp?: boolean;
  newLevel?: number;
}> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };
  const quest = db
    .select()
    .from(questInstances)
    .where(
      and(
        eq(questInstances.id, questId),
        eq(questInstances.userId, user.id),
      ),
    )
    .get();
  if (!quest) return { ok: false, error: "委托不存在" };
  const view = getDailyQuests(user.id, quest.dateKey).find(
    (item) => item.id === questId,
  );
  if (!view?.complete) return { ok: false, error: "委托目标尚未完成" };
  if (view.claimed) return { ok: true, gained: 0 };

  const before = getTotalXp(user.id);
  const beforeLevel = levelFromXp(before);
  const now = Date.now();
  db.insert(xpEvents)
    .values({
      userId: user.id,
      amount: quest.rewardXp,
      reason: "daily-quest",
      ref: String(quest.id),
      createdAt: now,
    })
    .onConflictDoNothing()
    .run();
  db.update(questInstances)
    .set({ claimedAt: now })
    .where(eq(questInstances.id, quest.id))
    .run();

  const total = getTotalXp(user.id);
  const newLevel = levelFromXp(total);
  revalidatePath("/");
  revalidatePath("/me");
  return {
    ok: true,
    gained: total - before,
    levelUp: newLevel > beforeLevel,
    newLevel,
  };
}
