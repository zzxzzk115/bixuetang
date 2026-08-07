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
import { settleBoostedXp } from "../game/boosts";
import { paidSegmentXp } from "../game/segment-rewards";
import { levelFromXp } from "../game/level";
import type { EpisodeLoot } from "../game/rpg";
import { settleEpisodeLoot, tryDropShieldHeart } from "../game/rpg-server";
import { courseBonusXp, episodeRef, episodeXp, XP_REASON } from "../game/xp";
import { allTermInputs } from "../game/glossary-source";
import { newlyUnlocked } from "../game/glossary-unlock";
import { enqueueEpisodeCards } from "../game/review-enqueue";
import { recordActivity } from "../game/streak-server";
import { getTotalXp, getUserProgress } from "./queries";

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
  loot?: EpisodeLoot;
  /** 这一集让你第一次见到的术语——卷宗解锁弹窗用 */
  unlockedTerms?: { term: string; definition: string }[];
  /** 本次入队的复习卡数(>0 时提示「N 张复习卡已入队」) */
  reviewCards?: number;
  /** 连胜(推进后的值)与是否刚消耗了冻结 */
  streak?: number;
  streakChanged?: boolean;
  usedFreeze?: boolean;
  /** 本次是否掉了一颗护盾血(蓝心) */
  shieldDropped?: boolean;
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
  let loot: EpisodeLoot | undefined;
  let cardsQueued = 0;
  let shieldDropped = false;
  let streakInfo: { current: number; changed: boolean; usedFreeze: boolean } | null =
    null;

  // 打卡前的观看集合——用来算「这一集让我第一次见到哪些词」，
  // 必须在写入 episodeProgress 之前取
  const watchedBefore = watched
    ? getUserProgress(user.id).watchedByCourse
    : null;

  if (watched) {
    const episodeInserted = db
      .insert(episodeProgress)
      .values({ userId: user.id, courseId, episodeN, watchedAt: now })
      .onConflictDoNothing()
      .returning({ episodeN: episodeProgress.episodeN })
      .get();
    if (episodeInserted) {
      loot = settleEpisodeLoot(user.id, course, episodeN) ?? undefined;
      // 该集的术语/知识点进复习队列(间隔重复),明天首次到期
      cardsQueued = enqueueEpisodeCards(user.id, courseId, episodeN);
      // 变率强化:完成一集有几率掉一颗护盾血(蓝心),满则不掉
      shieldDropped = tryDropShieldHeart(user.id);
    }
    // 今天有学习行为 → 连胜推进(同一天只会推进一次,幂等)
    const advanced = recordActivity(user.id);
    streakInfo = {
      current: advanced.current,
      changed: advanced.changed,
      usedFreeze: advanced.usedFreeze,
    };
    // (user, reason, ref) 唯一约束兜底幂等：重复勾选不重复得分
    // 单集 XP = 难度底分 + 时长加成，再吃药水（药水只在这里消耗一次次数）。
    // 幂等：已入过账的集不会重复扣药水（先探测 conflict 再决定是否结算）
    const episode = course.episodes.find((e) => e.n === episodeN);
    const alreadyScored = db
      .select({ id: xpEvents.id })
      .from(xpEvents)
      .where(
        and(
          eq(xpEvents.userId, user.id),
          eq(xpEvents.reason, XP_REASON.episode),
          eq(xpEvents.ref, episodeRef(courseId, episodeN)),
        ),
      )
      .get();
    if (!alreadyScored) {
      const base = episodeXp(course.level, episode?.durationSec);
      // 长视频的章节已阶段性发过 XP → 整集只补差额,总量守恒;
      // 药水次数只在没有章节发放史时消耗(章节结算时已逐段扣过)
      const paid = paidSegmentXp(user.id, courseId, episodeN);
      const remainder = Math.max(0, base - paid);
      if (remainder > 0) {
        db.insert(xpEvents)
          .values({
            userId: user.id,
            amount: settleBoostedXp(user.id, remainder, {
              consume: paid === 0,
              roundTo: paid === 0 ? 10 : 5,
            }),
            reason: XP_REASON.episode,
            ref: episodeRef(courseId, episodeN),
            createdAt: now,
          })
          .onConflictDoNothing()
          .run();
      }
    }

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
  revalidatePath("/");

  return {
    ok: true,
    gained: totalXp - before,
    bossBonus,
    levelUp: newLevel > levelBefore,
    newLevel,
    totalXp,
    courseDone,
    loot,
    unlockedTerms: watchedBefore
      ? newlyUnlocked(allTermInputs(), watchedBefore, courseId, episodeN)
      : [],
    reviewCards: cardsQueued,
    streak: streakInfo?.current,
    streakChanged: streakInfo?.changed,
    usedFreeze: streakInfo?.usedFreeze,
    shieldDropped,
  };
}
