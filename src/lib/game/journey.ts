import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  courseProgress,
  episodeProgress,
  learningSessions,
  reviewCards,
  users,
  videoNotes,
  xpEvents,
} from "../db/schema";
import { getContent } from "../content/load";
import { SUBJECT_LABEL } from "../content/schema";
import { dayKey } from "./day";
import { levelFromXp } from "./level";
import { getStreak } from "./streak-server";

// 学习足迹:把散落各表的努力聚成一页温柔的回顾。夸努力,不评判。

export interface Journey {
  name: string;
  joinedDay: string;
  totalXp: number;
  level: number;
  focusMinutes: number;
  episodesWatched: number;
  coursesStarted: number;
  coursesCompleted: number;
  notes: number;
  terms: number;
  activeDays: number;
  streakCurrent: number;
  streakBest: number;
  subjects: { subject: string; label: string; episodes: number }[];
}

export function getJourney(userId: number): Journey {
  const content = getContent();
  const user = db.select().from(users).where(eq(users.id, userId)).get();

  const xpRows = db
    .select({ amount: xpEvents.amount, createdAt: xpEvents.createdAt })
    .from(xpEvents)
    .where(eq(xpEvents.userId, userId))
    .all();
  const totalXp = xpRows.reduce((s, r) => s + r.amount, 0);
  const activeDays = new Set(xpRows.map((r) => dayKey(r.createdAt))).size;

  const focusMinutes =
    db
      .select({ n: sql<number>`coalesce(sum(${learningSessions.focusMinutes}),0)` })
      .from(learningSessions)
      .where(eq(learningSessions.userId, userId))
      .get()?.n ?? 0;

  const epRows = db
    .select({ courseId: episodeProgress.courseId })
    .from(episodeProgress)
    .where(eq(episodeProgress.userId, userId))
    .all();
  const episodesWatched = epRows.length;

  // 按学科聚集看过的集数(取内容里的 subject)
  const bySubject = new Map<string, number>();
  for (const r of epRows) {
    const subj = content.coursesById.get(r.courseId)?.subject;
    if (!subj) continue;
    bySubject.set(subj, (bySubject.get(subj) ?? 0) + 1);
  }
  const subjects = [...bySubject.entries()]
    .map(([subject, episodes]) => ({
      subject,
      label: SUBJECT_LABEL[subject as keyof typeof SUBJECT_LABEL] ?? subject,
      episodes,
    }))
    .sort((a, b) => b.episodes - a.episodes)
    .slice(0, 6);

  const cpRows = db
    .select({ status: courseProgress.status })
    .from(courseProgress)
    .where(eq(courseProgress.userId, userId))
    .all();
  const coursesStarted = cpRows.length;
  const coursesCompleted = cpRows.filter((r) => r.status === "done").length;

  const notes =
    db
      .select({ n: sql<number>`count(*)` })
      .from(videoNotes)
      .where(eq(videoNotes.userId, userId))
      .get()?.n ?? 0;

  const terms =
    db
      .select({ n: sql<number>`count(*)` })
      .from(reviewCards)
      .where(and(eq(reviewCards.userId, userId), eq(reviewCards.kind, "term")))
      .get()?.n ?? 0;

  const streak = getStreak(userId);
  const joinedMs =
    user?.createdAt ?? (xpRows.length ? Math.min(...xpRows.map((r) => r.createdAt)) : Date.now());

  return {
    name: user?.displayName || user?.username || "学员",
    joinedDay: dayKey(joinedMs),
    totalXp,
    level: levelFromXp(totalXp),
    focusMinutes,
    episodesWatched,
    coursesStarted,
    coursesCompleted,
    notes,
    terms,
    activeDays,
    streakCurrent: streak.current,
    streakBest: streak.best,
    subjects,
  };
}
