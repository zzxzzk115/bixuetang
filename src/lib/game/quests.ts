import "server-only";

import { and, eq } from "drizzle-orm";
import { getContent } from "@/lib/content/load";
import {
  checkpointAttempts,
  episodeProgress,
  learningSessions,
  questInstances,
} from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import { type QuestKind, questIsComplete } from "@/lib/game/quest-rules";
import { getUserProgress } from "@/lib/progress/queries";

export interface DailyQuestView {
  id: number;
  kind: QuestKind;
  title: string;
  description: string;
  courseId: string;
  courseTitle: string;
  episodeN: number;
  episodeTitle: string;
  progress: number;
  target: number;
  rewardXp: number;
  complete: boolean;
  claimed: boolean;
}

export function dailyDateKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function questCopy(kind: QuestKind, episodeTitle: string) {
  if (kind === "encounter") {
    return {
      title: "完成今日遭遇",
      description: `完成「${episodeTitle}」并记录战果`,
    };
  }
  if (kind === "focus") {
    return {
      title: "保持专注",
      description: "在远征计时器中累计至少 15 分钟",
    };
  }
  return {
    title: "提交战后复述",
    description: "用自己的话写下本集核心内容",
  };
}

function selectDailyTarget(userId: number) {
  const content = getContent();
  const progress = getUserProgress(userId);
  const active = [...progress.statusByCourse.entries()]
    .filter(([, status]) => status === "learning")
    .map(([courseId]) => content.coursesById.get(courseId))
    .find(Boolean);
  const course =
    active ??
    content.coursesById.get("missing-semester") ??
    content.courses.find((item) => item.level === "basic") ??
    content.courses[0];
  const watched = progress.watchedByCourse.get(course.id) ?? new Set<number>();
  const episode =
    course.episodes.find((item) => !watched.has(item.n)) ?? course.episodes[0];
  return { course, episode };
}

export function ensureDailyQuests(userId: number, dateKey = dailyDateKey()) {
  const { course, episode } = selectDailyTarget(userId);
  const now = Date.now();
  const definitions: { kind: QuestKind; target: number; rewardXp: number }[] = [
    { kind: "encounter", target: 1, rewardXp: 25 },
    { kind: "focus", target: 15, rewardXp: 20 },
    { kind: "checkpoint", target: 1, rewardXp: 30 },
  ];
  for (const definition of definitions) {
    db.insert(questInstances)
      .values({
        userId,
        dateKey,
        kind: definition.kind,
        courseId: course.id,
        episodeN: episode.n,
        target: definition.target,
        rewardXp: definition.rewardXp,
        createdAt: now,
      })
      .onConflictDoNothing()
      .run();
  }
}

export function getDailyQuests(
  userId: number,
  dateKey = dailyDateKey(),
): DailyQuestView[] {
  ensureDailyQuests(userId, dateKey);
  const content = getContent();
  const rows = db
    .select()
    .from(questInstances)
    .where(
      and(
        eq(questInstances.userId, userId),
        eq(questInstances.dateKey, dateKey),
      ),
    )
    .all();

  return rows.map((row) => {
    const kind = row.kind as QuestKind;
    const course = content.coursesById.get(row.courseId);
    const episode = course?.episodes.find((item) => item.n === row.episodeN);
    const watched = Boolean(
      db
        .select({ n: episodeProgress.episodeN })
        .from(episodeProgress)
        .where(
          and(
            eq(episodeProgress.userId, userId),
            eq(episodeProgress.courseId, row.courseId),
            eq(episodeProgress.episodeN, row.episodeN),
          ),
        )
        .get(),
    );
    const session = db
      .select()
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.userId, userId),
          eq(learningSessions.courseId, row.courseId),
          eq(learningSessions.episodeN, row.episodeN),
        ),
      )
      .get();
    const checkpointPassed = Boolean(
      db
        .select({ passed: checkpointAttempts.passed })
        .from(checkpointAttempts)
        .where(
          and(
            eq(checkpointAttempts.userId, userId),
            eq(checkpointAttempts.courseId, row.courseId),
            eq(checkpointAttempts.episodeN, row.episodeN),
            eq(checkpointAttempts.checkpointId, "recall"),
          ),
        )
        .get()?.passed,
    );
    const evidence = {
      watched,
      focusMinutes: session?.focusMinutes ?? 0,
      checkpointPassed,
    };
    const progress =
      kind === "encounter"
        ? Number(watched)
        : kind === "checkpoint"
          ? Number(checkpointPassed)
          : evidence.focusMinutes;
    const copy = questCopy(kind, episode?.title ?? `第 ${row.episodeN} 集`);
    return {
      id: row.id,
      kind,
      ...copy,
      courseId: row.courseId,
      courseTitle: course?.title ?? row.courseId,
      episodeN: row.episodeN,
      episodeTitle: episode?.title ?? `第 ${row.episodeN} 集`,
      progress: Math.min(progress, row.target),
      target: row.target,
      rewardXp: row.rewardXp,
      complete: questIsComplete(kind, evidence, row.target),
      claimed: row.claimedAt !== null,
    };
  });
}
