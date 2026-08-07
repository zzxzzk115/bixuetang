import "server-only";

import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { getContent } from "@/lib/content/load";
import { episodeProgress, questInstances, xpEvents } from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import { dayKey, monthKey } from "@/lib/game/day";
import {
  type QuestKind,
  type QuestEvidence,
  questIsComplete,
} from "@/lib/game/quest-rules";
import { getUserProgress } from "@/lib/progress/queries";

// 每日任务(目标梯度:三条进度条摆在地图页顶部,离完成越近越想点掉)。
// 任务对应现役玩法:看一集 / 完成复习 / 打一场试炼。

export interface DailyQuestView {
  id: number;
  kind: QuestKind;
  title: string;
  description: string;
  /** 点击去向 */
  href: string;
  progress: number;
  target: number;
  rewardXp: number;
  complete: boolean;
  claimed: boolean;
}

/** 学习日键(UTC+8,与 streak/SRS 同一日切) */
export function dailyDateKey(now = Date.now()): string {
  return dayKey(now);
}

/** 今日(UTC+8)的毫秒窗口 */
function dayWindow(key: string): { from: number; to: number } {
  const from = Date.parse(`${key}T00:00:00+08:00`);
  return { from, to: from + 86_400_000 };
}

/** 给 watch 任务挑推荐课:优先「在学」的课的下一集 */
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
    { kind: "watch", target: 1, rewardXp: 25 },
    { kind: "review", target: 1, rewardXp: 20 },
    { kind: "trial", target: 1, rewardXp: 30 },
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

function collectEvidence(userId: number, dateKey: string): QuestEvidence {
  const { from, to } = dayWindow(dateKey);
  const watchedToday = Boolean(
    db
      .select({ n: episodeProgress.episodeN })
      .from(episodeProgress)
      .where(
        and(
          eq(episodeProgress.userId, userId),
          gte(episodeProgress.watchedAt, from),
          lt(episodeProgress.watchedAt, to),
        ),
      )
      .get(),
  );
  const reviewDone = Boolean(
    db
      .select({ id: xpEvents.id })
      .from(xpEvents)
      .where(
        and(
          eq(xpEvents.userId, userId),
          eq(xpEvents.reason, "review"),
          eq(xpEvents.ref, dateKey),
        ),
      )
      .get(),
  );
  const trialDone = Boolean(
    db
      .select({ id: xpEvents.id })
      .from(xpEvents)
      .where(
        and(
          eq(xpEvents.userId, userId),
          inArray(xpEvents.reason, ["trial", "pk"]),
          eq(xpEvents.ref, dateKey),
        ),
      )
      .get(),
  );
  return { watchedToday, reviewDone, trialDone };
}

function questCopy(
  kind: QuestKind,
  target: { courseTitle: string; episodeN: number },
) {
  if (kind === "watch") {
    return {
      title: "今天看完一集",
      description: `推荐:${target.courseTitle} · 第 ${target.episodeN} 集`,
    };
  }
  if (kind === "review") {
    return {
      title: "完成今日复习",
      description: "把到期的复习卡清空,记忆才不掉线",
    };
  }
  return {
    title: "打一场试炼",
    description: "无限试炼或幽灵对战,任意一场",
  };
}

// 每日全勤奖:三条任务全部领取后一次性发放,幂等按 dayKey。
export const PERFECT_DAY_XP = 30;
export const PERFECT_DAY_COINS = 50;

export interface PerfectDayReward {
  xp: number;
  coins: number;
}

// 月度任务:本月累计领取的每日任务数达标即完成,给更大的奖励。
// 心理学上是「长期目标 + 目标梯度」:每天的小任务汇成一个月度大目标,
// 让「今天多做一条」有跨天的意义。进度按本月已领取的 daily-quest 事件计。
export const MONTHLY_TARGET = 40;
export const MONTHLY_REWARD_XP = 200;
export const MONTHLY_REWARD_COINS = 300;

export interface MonthlyQuestView {
  monthKey: string;
  progress: number;
  target: number;
  rewardXp: number;
  rewardCoins: number;
  complete: boolean;
  claimed: boolean;
}

/** 某月的毫秒边界 [start, end)(UTC+8) */
function monthBounds(mKey: string): [number, number] {
  const start = Date.parse(`${mKey}-01T00:00:00+08:00`);
  const [y, m] = mKey.split("-").map(Number);
  const nextKey =
    m === 12
      ? `${y + 1}-01`
      : `${y}-${String(m + 1).padStart(2, "0")}`;
  const end = Date.parse(`${nextKey}-01T00:00:00+08:00`);
  return [start, end];
}

export function getMonthlyQuest(
  userId: number,
  mKey = monthKey(),
): MonthlyQuestView {
  const [start, end] = monthBounds(mKey);
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(xpEvents)
    .where(
      and(
        eq(xpEvents.userId, userId),
        eq(xpEvents.reason, "daily-quest"),
        gte(xpEvents.createdAt, start),
        lt(xpEvents.createdAt, end),
      ),
    )
    .get();
  const progress = Number(row?.n ?? 0);
  const claimed = !!db
    .select({ id: xpEvents.id })
    .from(xpEvents)
    .where(
      and(
        eq(xpEvents.userId, userId),
        eq(xpEvents.reason, "monthly-quest"),
        eq(xpEvents.ref, mKey),
      ),
    )
    .get();
  return {
    monthKey: mKey,
    progress,
    target: MONTHLY_TARGET,
    rewardXp: MONTHLY_REWARD_XP,
    rewardCoins: MONTHLY_REWARD_COINS,
    complete: progress >= MONTHLY_TARGET,
    claimed,
  };
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
        inArray(questInstances.kind, ["watch", "review", "trial"]),
      ),
    )
    .all();
  const evidence = collectEvidence(userId, dateKey);

  return rows.map((row) => {
    const kind = row.kind as QuestKind;
    const course = content.coursesById.get(row.courseId);
    const copy = questCopy(kind, {
      courseTitle: course?.title ?? row.courseId,
      episodeN: row.episodeN,
    });
    const complete = questIsComplete(kind, evidence);
    return {
      id: row.id,
      kind,
      ...copy,
      href:
        kind === "watch"
          ? `/courses/${row.courseId}`
          : kind === "review"
            ? "/review"
            : "/play/trial",
      progress: complete ? 1 : 0,
      target: 1,
      rewardXp: row.rewardXp,
      complete,
      claimed: row.claimedAt !== null,
    };
  });
}
