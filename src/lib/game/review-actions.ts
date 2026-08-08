"use server";

import { and, asc, eq, gte, like, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth/session";
import { getContent } from "../content/load";
import { db } from "../db/client";
import { reviewCards, rpgProfiles, xpEvents } from "../db/schema";
import { applyTimedBoost } from "./boosts";
import { dayKey } from "./day";
import { getQuizBank } from "./quiz-bank";
import { drawQuiz, mulberry32 } from "./quiz-draw";
import { gradeFill, shouldFillIn } from "./review-fill";
import { schedule } from "./srs";
import { recordActivity } from "./streak-server";
import { getTotalXp } from "../progress/queries";
import { levelFromXp } from "./level";

// 今日复习(间隔重复的出题与结算)。
// 测试效应:复习是四选一主动回忆,不是重读;
// 目标梯度:x/y 进度在 UI 上可见,越接近完成动力越强。

/** 一次复习会话最多出这么多张(逾期太久的积压不该一天压垮人) */
const SESSION_CAP = 30;
// 答对单张卡的即时 XP(掌握奖励:答对才给)——填空(主动回忆)比四选一难,给更多
const HIT_MCQ = 4;
const HIT_FILL = 6;
const HIT_FAST = 2; // 快答再加
// 复习日完成奖励:底 + 随正确率缩放(不再是「答完就给」的定额)
const DAY_BONUS_BASE = 10;
const DAY_BONUS_ACC = 10;
// 正确率够高额外给金币——金币首次与掌握挂钩(此前只有看视频给金币)
const ACC_COIN_MIN = 0.8;
const ACC_COINS = 15;

/** 客户端拿到的题:不含答案(防读答案自动全对) */
export interface ReviewQuestion {
  mode: "mcq" | "fill";
  kind: "term" | "keypoint";
  /** 题面:mcq=术语/知识点标题;fill=定义(要用户打出术语) */
  prompt: string;
  /** mcq 的四个选项;fill 无 */
  options?: string[];
}

export interface ReviewCardView {
  cardId: number;
  courseId: string;
  /** 出处课程名(题面上下文,免得只给个孤零零的知识点标题) */
  courseTitle: string;
  episodeN: number;
  question: ReviewQuestion;
  /** 复习进度(第几次答对) */
  reps: number;
}

/** 服务端内部用的完整题(带答案),getDueReview 会剥掉答案再下发 */
interface FullQuestion extends ReviewQuestion {
  /** mcq 的正确选项下标 */
  answerIndex?: number;
  /** 正确答案文本:mcq=正确选项;fill=要打出的术语。判分与反馈都用它 */
  answerText: string;
}

type ReviewRow = ReturnType<typeof dueRows>[number];

/**
 * 由一张复习卡构造它的题目(含答案)。getDueReview 与 gradeReviewCard 共用,
 * 保证「出题」与「判分」是同一道题——mcq 用同一 seed 重算,答案不落库也可复现。
 */
function buildCardQuestion(
  row: ReviewRow,
  bank: ReturnType<typeof getQuizBank>,
  today: string,
): FullQuestion | null {
  const entries = bank.byCourse.get(row.courseId) ?? [];
  const entry = entries.find(
    (e) =>
      e.epN === row.episodeN && e.kind === row.kind && e.prompt === row.prompt,
  );
  if (!entry) return null;
  const kind = row.kind as "term" | "keypoint";

  // 熟练到一定次数的短术语卡升级成填空(主动回忆);其余仍四选一
  if (shouldFillIn(kind, row.reps, entry.prompt)) {
    return {
      mode: "fill",
      kind,
      prompt: entry.answer, // 给定义,让用户打出术语
      answerText: entry.prompt,
    };
  }
  const seed = mulberry32(row.id * 100003 + today.length * 7 + row.reps)();
  const [q] = drawQuiz({
    pool: [entry],
    fallback: bank.bySubject.get(entry.subject) ?? bank.all,
    count: 1,
    seed: Math.floor(seed * 2 ** 31),
  });
  if (!q) return null;
  return {
    mode: "mcq",
    kind: q.kind,
    prompt: q.prompt,
    options: q.options,
    answerIndex: q.answerIndex,
    answerText: q.options[q.answerIndex],
  };
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
    const full = buildCardQuestion(row, bank, today);
    if (!full) {
      // 内容改版把条目改没了:这张卡永远出不了题,清掉
      db.delete(reviewCards).where(eq(reviewCards.id, row.id)).run();
      continue;
    }
    cards.push({
      cardId: row.id,
      courseId: row.courseId,
      courseTitle: getContent().coursesById.get(row.courseId)?.title ?? "",
      episodeN: row.episodeN,
      // 只下发题面/选项,不含答案(答案留服务端判分)
      question: {
        mode: full.mode,
        kind: full.kind,
        prompt: full.prompt,
        options: full.options,
      },
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

/** 客户端提交的作答:mcq 传选项下标,fill 传打字内容;fast 只影响 ease,可信任 */
export interface GradeSubmission {
  mode: "mcq" | "fill";
  index?: number;
  text?: string;
  fast?: boolean;
}

export interface GradeResult {
  ok: boolean;
  error?: string;
  /** 服务端判定的对错(不再信客户端) */
  correct?: boolean;
  /** 正确答案文本(反馈显示) */
  correctText?: string;
  /** mcq 正确选项下标(高亮用) */
  correctIndex?: number;
  /** 下次间隔(天),UI 显示「N 天后再见」 */
  nextIntervalDays?: number;
  /** 本次答对入账的 XP(答错 0) */
  gained?: number;
}

export async function gradeReviewCard(
  cardId: number,
  submission: GradeSubmission,
): Promise<GradeResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };
  const row = db
    .select()
    .from(reviewCards)
    .where(and(eq(reviewCards.id, cardId), eq(reviewCards.userId, user.id)))
    .get();
  if (!row) return { ok: false, error: "卡片不存在" };

  const today = dayKey();
  const full = buildCardQuestion(row, getQuizBank(), today);
  if (!full) return { ok: false, error: "卡片已失效" };

  // 服务端判分:重算这道题的答案,不信客户端上报的对错
  const correct =
    full.mode === "mcq"
      ? submission.index === full.answerIndex
      : typeof submission.text === "string" &&
        gradeFill(submission.text, full.answerText);
  const fast = !!submission.fast && correct;

  const next = schedule(
    {
      intervalDays: row.intervalDays,
      ease: row.ease,
      reps: row.reps,
      lapses: row.lapses,
    },
    { correct, fast },
    today,
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

  // 掌握奖励:答对才给 XP(填空更难给更多,快答再加);(user,'review-hit',day:card) 幂等
  let gained = 0;
  if (correct) {
    const base = full.mode === "fill" ? HIT_FILL : HIT_MCQ;
    const amount = applyTimedBoost(user.id, base + (fast ? HIT_FAST : 0));
    const inserted = db
      .insert(xpEvents)
      .values({
        userId: user.id,
        amount,
        reason: "review-hit",
        ref: `${today}:${cardId}`,
        createdAt: Date.now(),
      })
      .onConflictDoNothing()
      .returning({ amount: xpEvents.amount })
      .get();
    gained = inserted?.amount ?? 0;
  }

  return {
    ok: true,
    correct,
    correctText: full.answerText,
    correctIndex: full.answerIndex,
    nextIntervalDays: next.intervalDays,
    gained,
  };
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
  /** 今日复习正确率 0–1(掌握信号) */
  accuracy: number;
  /** 本次因高正确率获得的金币(0 = 没到阈值或已领过) */
  coins: number;
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
      accuracy: 0,
      coins: 0,
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

  // 今日正确率:当天答过的卡为分母、当天答对(review-hit)为分子——全服务端算
  const todayStartMs =
    Date.parse(`${today}T00:00:00.000Z`) - 8 * 60 * 60 * 1000;
  const totalToday = Number(
    db
      .select({ n: sql<number>`count(*)` })
      .from(reviewCards)
      .where(
        and(
          eq(reviewCards.userId, user.id),
          gte(reviewCards.lastReviewedAt, todayStartMs),
        ),
      )
      .get()?.n ?? 0,
  );
  const correctToday = Number(
    db
      .select({ n: sql<number>`count(*)` })
      .from(xpEvents)
      .where(
        and(
          eq(xpEvents.userId, user.id),
          eq(xpEvents.reason, "review-hit"),
          like(xpEvents.ref, `${today}:%`),
        ),
      )
      .get()?.n ?? 0,
  );
  const accuracy = totalToday > 0 ? correctToday / totalToday : 1;

  const before = getTotalXp(user.id);
  let gained = 0;
  let coins = 0;
  if (left === 0) {
    // 完成奖励随正确率缩放(不再是答完就发的定额);(user,'review',今天) 唯一索引幂等
    const bonus = DAY_BONUS_BASE + Math.round(DAY_BONUS_ACC * accuracy);
    const inserted = db
      .insert(xpEvents)
      .values({
        userId: user.id,
        // 时长药水对复习奖励也生效(全局)
        amount: applyTimedBoost(user.id, bonus),
        reason: "review",
        ref: today,
        createdAt: Date.now(),
      })
      .onConflictDoNothing()
      .returning({ amount: xpEvents.amount })
      .get();
    gained = inserted?.amount ?? 0;
    // 正确率够高额外给金币(仅当天首次结算 inserted 时,防重复领)
    if (inserted && accuracy >= ACC_COIN_MIN) {
      const now = Date.now();
      db.insert(rpgProfiles)
        .values({ userId: user.id, coins: ACC_COINS, updatedAt: now })
        .onConflictDoUpdate({
          target: rpgProfiles.userId,
          set: {
            coins: sql`${rpgProfiles.coins} + ${ACC_COINS}`,
            updatedAt: now,
          },
        })
        .run();
      coins = ACC_COINS;
    }
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
    accuracy,
    coins,
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
