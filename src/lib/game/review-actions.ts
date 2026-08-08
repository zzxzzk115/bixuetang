"use server";

import { and, asc, eq, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth/session";
import { getContent } from "../content/load";
import { db } from "../db/client";
import { reviewCards, xpEvents } from "../db/schema";
import { applyTimedBoost } from "./boosts";
import { dayKey } from "./day";
import { getQuizBank } from "./quiz-bank";
import { drawQuiz, mulberry32, type QuizQuestion } from "./quiz-draw";
import { schedule } from "./srs";
import { recordActivity } from "./streak-server";
import { getTotalXp } from "../progress/queries";
import { levelFromXp } from "./level";

// 今日复习(间隔重复的出题与结算)。
// 测试效应:复习是四选一主动回忆,不是重读;
// 目标梯度:x/y 进度在 UI 上可见,越接近完成动力越强。

/** 一次复习会话最多出这么多张(逾期太久的积压不该一天压垮人) */
const SESSION_CAP = 30;
/** 当日到期卡全部答完的奖励 */
const REVIEW_XP = 20;

export interface ReviewCardView {
  cardId: number;
  courseId: string;
  /** 出处课程名(题面上下文,免得只给个孤零零的知识点标题) */
  courseTitle: string;
  episodeN: number;
  question: QuizQuestion;
  /** 复习进度(第几次答对) */
  reps: number;
}

export interface DueReview {
  cards: ReviewCardView[];
  /** 今天到期的总数(含本次出的) */
  dueTotal: number;
  /** 今天是否已领过复习奖励 */
  rewarded: boolean;
}

function dueRows(userId: number, today: string) {
  return db
    .select()
    .from(reviewCards)
    .where(and(eq(reviewCards.userId, userId), lte(reviewCards.dueDay, today)))
    .orderBy(asc(reviewCards.dueDay), asc(reviewCards.id))
    .limit(SESSION_CAP)
    .all();
}

export async function getDueReview(): Promise<DueReview | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "请先登录" };
  const today = dayKey();
  const rows = dueRows(user.id, today);
  const bank = getQuizBank();

  const cards: ReviewCardView[] = [];
  for (const row of rows) {
    const entries = bank.byCourse.get(row.courseId) ?? [];
    const entry = entries.find(
      (e) =>
        e.epN === row.episodeN && e.kind === row.kind && e.prompt === row.prompt,
    );
    if (!entry) {
      // 内容改版把条目改没了:这张卡永远出不了题,清掉
      db.delete(reviewCards).where(eq(reviewCards.id, row.id)).run();
      continue;
    }
    // 干扰项从同学科题库里找;seed 用卡 id + 日期,同一天重进题面稳定
    const seed = mulberry32(row.id * 100003 + today.length * 7 + row.reps)();
    const [question] = drawQuiz({
      pool: [entry],
      fallback: bank.bySubject.get(entry.subject) ?? bank.all,
      count: 1,
      seed: Math.floor(seed * 2 ** 31),
    });
    if (!question) continue;
    cards.push({
      cardId: row.id,
      courseId: row.courseId,
      courseTitle: getContent().coursesById.get(row.courseId)?.title ?? "",
      episodeN: row.episodeN,
      question,
      reps: row.reps,
    });
  }

  const rewarded = !!db
    .select({ id: xpEvents.id })
    .from(xpEvents)
    .where(
      and(
        eq(xpEvents.userId, user.id),
        eq(xpEvents.reason, "review"),
        eq(xpEvents.ref, today),
      ),
    )
    .get();

  return { cards, dueTotal: cards.length, rewarded };
}

export interface GradeResult {
  ok: boolean;
  error?: string;
  /** 下次间隔(天),UI 显示「N 天后再见」 */
  nextIntervalDays?: number;
}

export async function gradeReviewCard(
  cardId: number,
  correct: boolean,
  fast: boolean,
): Promise<GradeResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };
  const row = db
    .select()
    .from(reviewCards)
    .where(and(eq(reviewCards.id, cardId), eq(reviewCards.userId, user.id)))
    .get();
  if (!row) return { ok: false, error: "卡片不存在" };

  const next = schedule(
    {
      intervalDays: row.intervalDays,
      ease: row.ease,
      reps: row.reps,
      lapses: row.lapses,
    },
    { correct, fast },
    dayKey(),
  );
  db.update(reviewCards)
    .set({
      dueDay: next.dueDay,
      intervalDays: next.intervalDays,
      ease: next.ease,
      reps: next.reps,
      lapses: next.lapses,
      lastReviewedAt: Date.now(),
    })
    .where(eq(reviewCards.id, cardId))
    .run();
  return { ok: true, nextIntervalDays: next.intervalDays };
}

export interface ReviewSettleResult {
  ok: boolean;
  error?: string;
  /** 本次入账 XP(0 = 今天已领过) */
  gained: number;
  levelUp: boolean;
  newLevel: number;
  streak: number;
  usedFreeze: boolean;
  /** 还剩多少张今天到期没答(>0 说明还没答完,不发奖励) */
  remaining: number;
}

export async function settleReviewDay(): Promise<ReviewSettleResult> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      error: "请先登录",
      gained: 0,
      levelUp: false,
      newLevel: 0,
      streak: 0,
      usedFreeze: false,
      remaining: 0,
    };
  }
  const today = dayKey();
  const remaining = db
    .select({ n: sql<number>`count(*)` })
    .from(reviewCards)
    .where(
      and(eq(reviewCards.userId, user.id), lte(reviewCards.dueDay, today)),
    )
    .get();
  const left = Number(remaining?.n ?? 0);

  const before = getTotalXp(user.id);
  let gained = 0;
  if (left === 0) {
    // (user, reason='review', ref=今天) 唯一索引 → 一天只发一次,天然幂等
    const inserted = db
      .insert(xpEvents)
      .values({
        userId: user.id,
        // 时长药水对复习奖励也生效(全局)
        amount: applyTimedBoost(user.id, REVIEW_XP),
        reason: "review",
        ref: today,
        createdAt: Date.now(),
      })
      .onConflictDoNothing()
      .returning({ amount: xpEvents.amount })
      .get();
    gained = inserted?.amount ?? 0;
  }
  const streak = recordActivity(user.id);
  const total = before + gained;
  // 只刷新地图页(复习入口计数);/review 自己正显示结算屏,
  // revalidate 会把它重挂载成「没有到期的卡」空态
  revalidatePath("/play");
  return {
    ok: true,
    gained,
    levelUp: levelFromXp(total) > levelFromXp(before),
    newLevel: levelFromXp(total),
    streak: streak.current,
    usedFreeze: streak.usedFreeze,
    remaining: left,
  };
}

/** 今日到期卡数(地图页入口卡用,目标梯度展示) */
export async function getDueCount(): Promise<number> {
  const user = await getCurrentUser();
  if (!user) return 0;
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(reviewCards)
    .where(
      and(eq(reviewCards.userId, user.id), lte(reviewCards.dueDay, dayKey())),
    )
    .get();
  return Number(row?.n ?? 0);
}
