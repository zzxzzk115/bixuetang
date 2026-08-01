import "server-only";
import { desc, eq, sum } from "drizzle-orm";
import { db } from "../db/client";
import {
  courseProgress,
  episodeProgress,
  skillUnlocks,
  xpEvents,
  type CourseStatus,
} from "../db/schema";
import { getContent } from "../content/load";
import { SUBJECTS, type Subject } from "../content/schema";
import { episodeXp } from "../game/xp";
import { levelProgress, type LevelProgress } from "../game/level";

export interface UserProgress {
  /** courseId → 状态 */
  statusByCourse: Map<string, CourseStatus>;
  /** courseId → 已看集数集合 */
  watchedByCourse: Map<string, Set<number>>;
  totalXp: number;
  level: LevelProgress;
  litSkills: Set<string>;
}

export function getUserProgress(userId: number): UserProgress {
  const statusRows = db
    .select()
    .from(courseProgress)
    .where(eq(courseProgress.userId, userId))
    .all();
  const episodeRows = db
    .select()
    .from(episodeProgress)
    .where(eq(episodeProgress.userId, userId))
    .all();
  const litRows = db
    .select()
    .from(skillUnlocks)
    .where(eq(skillUnlocks.userId, userId))
    .all();

  const statusByCourse = new Map<string, CourseStatus>();
  for (const r of statusRows) statusByCourse.set(r.courseId, r.status);

  const watchedByCourse = new Map<string, Set<number>>();
  for (const r of episodeRows) {
    let set = watchedByCourse.get(r.courseId);
    if (!set) watchedByCourse.set(r.courseId, (set = new Set()));
    set.add(r.episodeN);
  }

  const totalXp = getTotalXp(userId);
  return {
    statusByCourse,
    watchedByCourse,
    totalXp,
    level: levelProgress(totalXp),
    litSkills: new Set(litRows.map((r) => r.skillId)),
  };
}

export function getTotalXp(userId: number): number {
  const row = db
    .select({ total: sum(xpEvents.amount) })
    .from(xpEvents)
    .where(eq(xpEvents.userId, userId))
    .get();
  return Number(row?.total ?? 0);
}

export interface XpLogEntry {
  amount: number;
  reason: string;
  ref: string;
  createdAt: number;
  /** 由 ref 解析出的展示文案 */
  label: string;
}

export function getXpLog(userId: number, limit = 20): XpLogEntry[] {
  const content = getContent();
  const rows = db
    .select()
    .from(xpEvents)
    .where(eq(xpEvents.userId, userId))
    .orderBy(desc(xpEvents.id))
    .limit(limit)
    .all();
  return rows.map((r) => {
    let label = r.ref;
    if (r.reason === "episode") {
      const [courseId, , n] = r.ref.split(":");
      const title = content.coursesById.get(courseId)?.title ?? courseId;
      label = `击败小怪：${title} · 第 ${n} 集`;
    } else if (r.reason === "course-done") {
      const title = content.coursesById.get(r.ref)?.title ?? r.ref;
      label = `Boss 讨伐：${title} 通关！`;
    }
    return { ...r, label };
  });
}

/** 学科修为（M2 版）：按已看集数折算的各学科 XP */
export function getSubjectXp(progress: UserProgress): Record<Subject, number> {
  const content = getContent();
  const stats = Object.fromEntries(SUBJECTS.map((s) => [s, 0])) as Record<
    Subject,
    number
  >;
  for (const [courseId, watched] of progress.watchedByCourse) {
    const course = content.coursesById.get(courseId);
    if (!course) continue; // 内容被删除的孤儿进度：读时忽略
    stats[course.subject] += watched.size * episodeXp(course.level);
  }
  return stats;
}
