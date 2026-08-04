"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth/session";
import { getContent } from "../content/load";
import { LEVEL_FACTOR } from "../content/schema";
import type { Subject } from "../content/schema";
import { db } from "../db/client";
import { rpgProfiles, xpEvents } from "../db/schema";
import { getActiveBoost } from "./boosts";
import { levelFromXp } from "./level";
import { boostedXp, episodeXp } from "./xp";
import { buildLessonTrack, findTrackNode } from "./lesson-track";
import { getTotalXp } from "../progress/queries";
import { dailyDateKey } from "./quests";
import { courseHasQuiz, getQuizBank } from "./quiz-bank";
import { drawQuiz, type QuizQuestion } from "./quiz-draw";
import { getRpgProfile } from "./rpg-server";
import { sessionPerks, type SessionPerks } from "./session-perks";

// 地图测验节点 / 无限试炼的服务端出题与结算。
// v1 与实验室打卡同级：信任客户端上报的答题结果，防刷靠 xp_events 幂等键。

/** 每次课程测验的题数 */
const QUIZ_SIZE = 8;

export interface QuizPayload {
  ok: boolean;
  error?: string;
  questions?: QuizQuestion[];
  perks?: SessionPerks;
  seed?: number;
}

function lessonTrackFor(courseId: string) {
  const course = getContent().coursesById.get(courseId);
  if (!course) return null;
  return {
    course,
    track: buildLessonTrack(
      course.episodes.map((e) => e.n),
      courseHasQuiz(courseId),
    ),
  };
}

/** 课程测验节点出题：题目出自该测验覆盖的集，干扰项从全课程 → 同学科补 */
export async function getCourseQuiz(
  courseId: string,
  quizIndex: number,
): Promise<QuizPayload> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  const found = lessonTrackFor(courseId);
  const node = found && findTrackNode(found.track, "quiz", quizIndex);
  if (!found || !node) return { ok: false, error: "测验不存在" };

  const bank = getQuizBank();
  const courseEntries = bank.byCourse.get(courseId) ?? [];
  const epSet = new Set(node.eps);
  let pool = courseEntries.filter((e) => epSet.has(e.epN));
  // 覆盖集里题不够（分析可能只写了部分集）就退回全课程出题
  if (pool.length < QUIZ_SIZE) pool = courseEntries;

  const seed = (Date.now() ^ (user.id << 16)) >>> 0;
  const questions = drawQuiz({
    pool,
    fallback: bank.bySubject.get(found.course.subject) ?? [],
    count: QUIZ_SIZE,
    seed,
  });
  if (questions.length < 3) return { ok: false, error: "该课程题库不足" };

  return {
    ok: true,
    questions,
    perks: sessionPerks(getRpgProfile(user.id).stats),
    seed,
  };
}

export interface NodeEpisodesPayload {
  ok: boolean;
  error?: string;
  episodes?: {
    n: number;
    title: string;
    watched: boolean;
    /** 完成这一集能拿的 XP（已含药水加成，10 的倍数） */
    xp: number;
    /** 未加成的底分（加成中时前端可展示划线原价） */
    baseXp: number;
  }[];
  /** 生效中的加成倍率（100=无） */
  multiplierPct?: number;
}

/** 地图视频节点气泡：按需取该节点覆盖各集的标题与打卡状态（不塞注水） */
export async function getVideoNodeEpisodes(
  courseId: string,
  videoIndex: number,
): Promise<NodeEpisodesPayload> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  const found = lessonTrackFor(courseId);
  const node = found && findTrackNode(found.track, "video", videoIndex);
  if (!found || !node) return { ok: false, error: "节点不存在" };

  const { getUserProgress } = await import("../progress/queries");
  const watched = getUserProgress(user.id).watchedByCourse.get(courseId);
  const byN = new Map(found.course.episodes.map((e) => [e.n, e]));
  const boost = getActiveBoost(user.id);
  return {
    ok: true,
    multiplierPct: boost?.multiplierPct ?? 100,
    episodes: node.eps.map((n) => {
      const ep = byN.get(n);
      const base = episodeXp(found.course.level, ep?.durationSec);
      return {
        n,
        title: ep?.title ?? `第 ${n} 讲`,
        watched: watched?.has(n) ?? false,
        baseXp: base,
        xp: boost ? boostedXp(base, boost.multiplierPct) : base,
      };
    }),
  };
}

export interface QuizSettleResult {
  ok: boolean;
  error?: string;
  /** 是否达到通过线（≥60% 正确） */
  passed?: boolean;
  /** 本次入账 XP（重复通关为 0） */
  gained?: number;
  coins?: number;
  levelUp?: boolean;
  newLevel?: number;
}

/** 交卷：通过则发 XP（幂等，首通才有），不通过只返回结果。fast=快答数（精准加成） */
export async function submitQuizNode(
  courseId: string,
  quizIndex: number,
  correct: number,
  total: number,
  fast = 0,
): Promise<QuizSettleResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  const found = lessonTrackFor(courseId);
  const node = found && findTrackNode(found.track, "quiz", quizIndex);
  if (!found || !node) return { ok: false, error: "测验不存在" };
  if (
    !Number.isInteger(correct) ||
    !Number.isInteger(total) ||
    !Number.isInteger(fast) ||
    total < 1 ||
    total > 20 ||
    correct < 0 ||
    correct > total ||
    fast < 0 ||
    fast > correct
  ) {
    return { ok: false, error: "非法结果" };
  }

  const passed = correct / total >= 0.6;
  if (!passed) return { ok: true, passed: false, gained: 0 };

  // 快答每题 +1 底分——精准属性放宽快答窗口，让「又快又准」有回报
  const amount = Math.round(
    (6 + correct * 3 + fast) * LEVEL_FACTOR[found.course.level],
  );
  const before = getTotalXp(user.id);
  const inserted = db
    .insert(xpEvents)
    .values({
      userId: user.id,
      amount,
      reason: "quiz",
      ref: `${courseId}:${quizIndex}`,
      createdAt: Date.now(),
    })
    .onConflictDoNothing()
    .returning({ amount: xpEvents.amount })
    .get();

  // 注意：这里不能 revalidatePath —— server action 里 revalidate 会连当前
  // 页面一起刷新（见 next 文档 revalidatePath.md），quiz 页会重新出题、
  // key 变化导致结算页被顶掉重开一局。/play 是动态渲染，回去自然是新状态。
  const gained = inserted?.amount ?? 0;
  const totalXp = before + gained;
  return {
    ok: true,
    passed: true,
    gained,
    levelUp: levelFromXp(totalXp) > levelFromXp(before),
    newLevel: levelFromXp(totalXp),
  };
}

export interface ChestResult {
  ok: boolean;
  error?: string;
  coins?: number;
  gained?: number;
  /** 已领过 */
  already?: boolean;
}

/** 开宝箱：前提是宝箱之前的集全部看完；奖励金币 + XP，幂等 */
export async function openChestNode(
  courseId: string,
  chestIndex: number,
): Promise<ChestResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  const found = lessonTrackFor(courseId);
  const node = found && findTrackNode(found.track, "chest", chestIndex);
  if (!found || !node) return { ok: false, error: "宝箱不存在" };

  const { getUserProgress } = await import("../progress/queries");
  const watched = getUserProgress(user.id).watchedByCourse.get(courseId);
  if (!node.eps.every((n) => watched?.has(n))) {
    return { ok: false, error: "还有小节没完成" };
  }

  const now = Date.now();
  const factor = LEVEL_FACTOR[found.course.level];
  const isFinal =
    node.eps.length === found.course.episodes.length &&
    chestIndex ===
      found.track.filter((n) => n.kind === "chest").length - 1;
  const coins = Math.round((isFinal ? 60 : 25) * factor);
  const xp = Math.round((isFinal ? 20 : 10) * factor);

  const inserted = db
    .insert(xpEvents)
    .values({
      userId: user.id,
      amount: xp,
      reason: "chest",
      ref: `${courseId}:${chestIndex}`,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ amount: xpEvents.amount })
    .get();
  if (!inserted) return { ok: true, already: true, coins: 0, gained: 0 };

  db.insert(rpgProfiles)
    .values({ userId: user.id, coins, updatedAt: now })
    .onConflictDoUpdate({
      target: rpgProfiles.userId,
      set: { coins: sql`${rpgProfiles.coins} + ${coins}`, updatedAt: now },
    })
    .run();

  revalidatePath("/play");
  return { ok: true, coins, gained: xp };
}

/** 无限试炼出题：全学科混合（或指定学科），客户端快见底时再拉下一批 */
export async function getTrialBatch(
  subject: Subject | null,
  seed: number,
  count = 20,
): Promise<QuizPayload> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  const bank = getQuizBank();
  const pool = subject ? (bank.bySubject.get(subject) ?? []) : bank.all;
  if (pool.length < 8) return { ok: false, error: "题库不足" };

  const questions = drawQuiz({
    pool,
    fallback: bank.all,
    count: Math.min(count, 50),
    seed: seed >>> 0,
  });
  return {
    ok: true,
    questions,
    perks: sessionPerks(getRpgProfile(user.id).stats),
    seed,
  };
}

export interface TrialSettleResult {
  ok: boolean;
  error?: string;
  gained?: number;
  coins?: number;
  /** 今日奖励已领过（练习不重复给） */
  already?: boolean;
}

/** 试炼结算：每天第一场按成绩发奖（XP=2×答对+快答 封顶 60，金币=答对 封顶 30） */
export async function settleTrialRun(
  correct: number,
  fast = 0,
): Promise<TrialSettleResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };
  if (
    !Number.isInteger(correct) ||
    !Number.isInteger(fast) ||
    correct < 0 ||
    correct > 500 ||
    fast < 0 ||
    fast > correct
  ) {
    return { ok: false, error: "非法结果" };
  }
  if (correct === 0) return { ok: true, gained: 0, coins: 0 };

  const now = Date.now();
  const xp = Math.min(correct * 2 + fast, 60);
  const coins = Math.min(correct, 30);
  const inserted = db
    .insert(xpEvents)
    .values({
      userId: user.id,
      amount: xp,
      reason: "trial",
      ref: dailyDateKey(),
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ amount: xpEvents.amount })
    .get();
  if (!inserted) return { ok: true, already: true, gained: 0, coins: 0 };

  db.insert(rpgProfiles)
    .values({ userId: user.id, coins, updatedAt: now })
    .onConflictDoUpdate({
      target: rpgProfiles.userId,
      set: { coins: sql`${rpgProfiles.coins} + ${coins}`, updatedAt: now },
    })
    .run();

  // 同 submitQuizNode：不 revalidate，试炼结算页要留在原地；退出时客户端自行 refresh
  return { ok: true, gained: xp, coins };
}
