"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth/session";
import { getContent } from "../content/load";
import { db } from "../db/client";
import {
  COURSE_STATUSES,
  courseProgress,
  episodeProgress,
  xpEvents,
  type CourseStatus,
} from "../db/schema";
import { levelFromXp } from "../game/level";
import { courseBonusXp, episodeRef, episodeXp, XP_REASON } from "../game/xp";
import { getTotalXp } from "./queries";

export interface ToggleResult {
  ok: boolean;
  error?: string;
  /** 本次实际入账的 XP（含 Boss 奖励） */
  gained?: number;
  /** Boss 通关奖励部分 */
  bossBonus?: number;
  /** 是否触发升级 */
  levelUp?: boolean;
  newLevel?: number;
  totalXp?: number;
  courseDone?: boolean;
}

function upsertStatus(userId: number, courseId: string, status: CourseStatus) {
  const now = Date.now();
  db.insert(courseProgress)
    .values({ userId, courseId, status, updatedAt: now })
    .onConflictDoUpdate({
      target: [courseProgress.userId, courseProgress.courseId],
      set: { status, updatedAt: now },
    })
    .run();
}

export async function setCourseStatus(
  courseId: string,
  status: CourseStatus,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };
  if (!COURSE_STATUSES.includes(status)) return { ok: false, error: "非法状态" };
  if (!getContent().coursesById.has(courseId)) {
    return { ok: false, error: "课程不存在" };
  }
  upsertStatus(user.id, courseId, status);
  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/courses");
  revalidatePath("/me");
  return { ok: true };
}

export interface LabTaskResult {
  ok: boolean;
  error?: string;
  gained?: number;
  taskTitle?: string;
  levelUp?: boolean;
  newLevel?: number;
}

/** 实验室成就打卡（v1 信任客户端触发，防重复靠幂等键） */
export async function completeLabTask(
  labId: string,
  taskId: string,
): Promise<LabTaskResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  const lab = getContent().labTasksById.get(labId as "hack" | "math");
  const task = lab?.tasks.find((t) => t.id === taskId);
  if (!task) return { ok: false, error: "任务不存在" };

  const before = getTotalXp(user.id);
  const inserted = db
    .insert(xpEvents)
    .values({
      userId: user.id,
      amount: task.xp,
      reason: "lab-task",
      ref: `${labId}:${taskId}`,
      createdAt: Date.now(),
    })
    .onConflictDoNothing()
    .returning({ amount: xpEvents.amount })
    .get();

  const gained = inserted?.amount ?? 0;
  if (gained > 0) {
    revalidatePath(`/lab/${labId}`);
    revalidatePath("/me");
  }
  const total = before + gained;
  return {
    ok: true,
    gained,
    taskTitle: task.title,
    levelUp: levelFromXp(total) > levelFromXp(before),
    newLevel: levelFromXp(total),
  };
}

export async function toggleEpisode(
  courseId: string,
  episodeN: number,
  watched: boolean,
): Promise<ToggleResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  const course = getContent().coursesById.get(courseId);
  if (!course) return { ok: false, error: "课程不存在" };
  if (!course.episodes.some((e) => e.n === episodeN)) {
    return { ok: false, error: "集数不存在" };
  }

  const before = getTotalXp(user.id);
  const levelBefore = levelFromXp(before);
  const now = Date.now();
  let bossBonus = 0;
  let courseDone = false;

  if (watched) {
    db.insert(episodeProgress)
      .values({ userId: user.id, courseId, episodeN, watchedAt: now })
      .onConflictDoNothing()
      .run();
    // (user, reason, ref) 唯一约束兜底幂等：重复勾选不重复得分
    db.insert(xpEvents)
      .values({
        userId: user.id,
        amount: episodeXp(course.level),
        reason: XP_REASON.episode,
        ref: episodeRef(courseId, episodeN),
        createdAt: now,
      })
      .onConflictDoNothing()
      .run();

    // 首次有进度时自动置为「在学」
    const cur = db
      .select({ status: courseProgress.status })
      .from(courseProgress)
      .where(
        and(
          eq(courseProgress.userId, user.id),
          eq(courseProgress.courseId, courseId),
        ),
      )
      .get();
    if (!cur || cur.status === "planned") {
      upsertStatus(user.id, courseId, "learning");
    }

    // 全部集数击破 → Boss 结算（幂等）
    const watchedCount = db
      .select({ n: episodeProgress.episodeN })
      .from(episodeProgress)
      .where(
        and(
          eq(episodeProgress.userId, user.id),
          eq(episodeProgress.courseId, courseId),
        ),
      )
      .all().length;
    if (watchedCount >= course.episodes.length) {
      courseDone = true;
      const bonus = db
        .insert(xpEvents)
        .values({
          userId: user.id,
          amount: courseBonusXp(course.episodes.length, course.level),
          reason: XP_REASON.courseDone,
          ref: courseId,
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning({ amount: xpEvents.amount })
        .get();
      if (bonus) bossBonus = bonus.amount;
      upsertStatus(user.id, courseId, "done");
    }
  } else {
    // 取消勾选：进度回退，但 XP 不扣（防刷靠幂等键，不惩罚手滑）
    db.delete(episodeProgress)
      .where(
        and(
          eq(episodeProgress.userId, user.id),
          eq(episodeProgress.courseId, courseId),
          eq(episodeProgress.episodeN, episodeN),
        ),
      )
      .run();
  }

  const totalXp = getTotalXp(user.id);
  const newLevel = levelFromXp(totalXp);

  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/me");

  return {
    ok: true,
    gained: totalXp - before,
    bossBonus,
    levelUp: newLevel > levelBefore,
    newLevel,
    totalXp,
    courseDone,
  };
}
