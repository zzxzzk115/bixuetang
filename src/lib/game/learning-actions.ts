"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { checkpointAttempts, learningSessions, xpEvents } from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import { levelFromXp } from "@/lib/game/level";
import {
  FOCUS_REWARD_MINUTES,
  isSummaryEvidence,
  normalizeFocusMinutes,
} from "@/lib/game/quest-rules";
import { getTotalXp } from "@/lib/progress/queries";

export interface LearningSessionResult {
  ok: boolean;
  error?: string;
  gained?: number;
  totalMinutes?: number;
  checkpointPassed?: boolean;
  levelUp?: boolean;
  newLevel?: number;
}

export async function completeLearningSession(
  courseId: string,
  episodeN: number,
  focusMinutesInput: number,
  summaryInput: string,
): Promise<LearningSessionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  const course = getContent().coursesById.get(courseId);
  if (!course || !course.episodes.some((episode) => episode.n === episodeN)) {
    return { ok: false, error: "课程或分集不存在" };
  }

  const focusMinutes = normalizeFocusMinutes(focusMinutesInput);
  const summary = summaryInput.trim().slice(0, 2000);
  const checkpointPassed = isSummaryEvidence(summary);
  if (focusMinutes === 0 && !checkpointPassed) {
    return { ok: false, error: "至少记录 1 分钟专注，或提交 12 字以上的本集复述" };
  }

  const now = Date.now();
  const beforeXp = getTotalXp(user.id);
  const beforeLevel = levelFromXp(beforeXp);
  const existing = db
    .select()
    .from(learningSessions)
    .where(
      and(
        eq(learningSessions.userId, user.id),
        eq(learningSessions.courseId, courseId),
        eq(learningSessions.episodeN, episodeN),
      ),
    )
    .get();
  const totalMinutes = Math.min(600, (existing?.focusMinutes ?? 0) + focusMinutes);

  db.insert(learningSessions)
    .values({
      userId: user.id,
      courseId,
      episodeN,
      focusMinutes: totalMinutes,
      summary: summary || existing?.summary || null,
      startedAt: existing?.startedAt ?? now,
      updatedAt: now,
      completedAt: checkpointPassed ? now : existing?.completedAt ?? null,
    })
    .onConflictDoUpdate({
      target: [
        learningSessions.userId,
        learningSessions.courseId,
        learningSessions.episodeN,
      ],
      set: {
        focusMinutes: totalMinutes,
        summary: summary || existing?.summary || null,
        updatedAt: now,
        completedAt: checkpointPassed ? now : existing?.completedAt ?? null,
      },
    })
    .run();

  if (checkpointPassed) {
    db.insert(checkpointAttempts)
      .values({
        userId: user.id,
        courseId,
        episodeN,
        checkpointId: "recall",
        response: summary,
        passed: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          checkpointAttempts.userId,
          checkpointAttempts.courseId,
          checkpointAttempts.episodeN,
          checkpointAttempts.checkpointId,
        ],
        set: { response: summary, passed: true, updatedAt: now },
      })
      .run();
  }

  if (totalMinutes >= FOCUS_REWARD_MINUTES) {
    db.insert(xpEvents)
      .values({
        userId: user.id,
        amount: 20,
        reason: "focus-session",
        ref: `${courseId}:${episodeN}`,
        createdAt: now,
      })
      .onConflictDoNothing()
      .run();
  }
  if (checkpointPassed) {
    db.insert(xpEvents)
      .values({
        userId: user.id,
        amount: 25,
        reason: "checkpoint",
        ref: `${courseId}:${episodeN}`,
        createdAt: now,
      })
      .onConflictDoNothing()
      .run();
  }

  const totalXp = getTotalXp(user.id);
  const newLevel = levelFromXp(totalXp);
  revalidatePath("/");
  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/me");

  return {
    ok: true,
    gained: totalXp - beforeXp,
    totalMinutes,
    checkpointPassed,
    levelUp: newLevel > beforeLevel,
    newLevel,
  };
}
