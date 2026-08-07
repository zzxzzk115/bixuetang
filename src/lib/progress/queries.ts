import "server-only";
import { desc, eq, sum } from "drizzle-orm";
import { db } from "../db/client";
import {
  courseProgress,
  episodeProgress,
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
    } else if (r.reason === "segment") {
      const [courseId, , n, idx] = r.ref.split(":");
      const title = content.coursesById.get(courseId)?.title ?? courseId;
      label = `章节推进：${title} · 第 ${n} 集 · 第 ${Number(idx) + 1} 段`;
    } else if (r.reason === "lab-task") {
      const [labId, taskId] = r.ref.split(":");
      const task = content.labTasksById
        .get(labId as "hack" | "math")
        ?.tasks.find((t) => t.id === taskId);
      label = `实验室成就：${task?.title ?? r.ref}`;
    }
    if (r.reason === "focus-session") {
      const [courseId, episodeN] = r.ref.split(":");
      const title = content.coursesById.get(courseId)?.title ?? courseId;
      label = `专注训练：${title} · 第 ${episodeN} 集`;
    } else if (r.reason === "checkpoint") {
      const [courseId, episodeN] = r.ref.split(":");
      const title = content.coursesById.get(courseId)?.title ?? courseId;
      label = `战后复述：${title} · 第 ${episodeN} 集`;
    } else if (r.reason === "daily-quest") {
      label = "每日委托结算";
    } else if (r.reason === "daily-perfect") {
      label = "每日全勤奖";
    } else if (r.reason === "monthly-quest") {
      label = `月度任务达成 · ${r.ref}`;
    } else if (r.reason === "quiz") {
      const [courseId, idx] = r.ref.split(":");
      const title = content.coursesById.get(courseId)?.title ?? courseId;
      label = `阶段测验通过：${title} · 第 ${Number(idx) + 1} 场`;
    } else if (r.reason === "chest") {
      const [courseId] = r.ref.split(":");
      const title = content.coursesById.get(courseId)?.title ?? courseId;
      label = `开启宝箱：${title}`;
    } else if (r.reason === "trial") {
      label = `无限试炼：${r.ref} 每日结算`;
    }
    return { ...r, label };
  });
}

/** 某实验室已完成的任务 id 集合（从 xp_events 的幂等键推导） */
export function getLabTasksDone(userId: number, labId: string): Set<string> {
  const rows = db
    .select({ ref: xpEvents.ref })
    .from(xpEvents)
    .where(eq(xpEvents.userId, userId))
    .all();
  const prefix = `${labId}:`;
  return new Set(
    rows.filter((r) => r.ref.startsWith(prefix)).map((r) => r.ref.slice(prefix.length)),
  );
}

/** 已完成（done）的课程集合 */
export function doneCourseIds(progress: UserProgress): Set<string> {
  return new Set(
    [...progress.statusByCourse.entries()]
      .filter(([, s]) => s === "done")
      .map(([id]) => id),
  );
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
