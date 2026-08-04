"use server";

import { sql } from "drizzle-orm";
import { getCurrentUser } from "../auth/session";
import { db } from "../db/client";
import { pkRatings, pkRuns, rpgProfiles, xpEvents } from "../db/schema";
import {
  applyElo,
  duelResult,
  rankFromRating,
  type PkOutcome,
} from "./elo";
import { botGhost, findGhost, getRunById, loadRating } from "./pk";
import { dailyDateKey } from "./quests";
import { getQuizBank } from "./quiz-bank";
import { drawQuiz, type QuizQuestion } from "./quiz-draw";
import { getRpgProfile } from "./rpg-server";
import { sessionPerks, type SessionPerks } from "./session-perks";

// 幽灵对战：挑战别人某场对局的「录像」。双方打同一 seed 的同一套题
// （题库稳定时 drawQuiz 可复现），幽灵的逐题时间线在你答题时同步回放。
// v1 只结算挑战者的排位分（幽灵主人不掉分——离线被打不惩罚），
// 对局照常入库成为别人的幽灵。

export interface PkGhostDto {
  runId: number | null;
  name: string;
  rating: number;
  outcomes: PkOutcome[];
  isBot: boolean;
}

export interface PkMatchPayload {
  ok: boolean;
  error?: string;
  seed?: number;
  questions?: QuizQuestion[];
  perks?: SessionPerks;
  ghost?: PkGhostDto;
  myRating?: number;
}

function drawPkQuestions(seed: number, count: number): QuizQuestion[] {
  const bank = getQuizBank();
  return drawQuiz({ pool: bank.all, fallback: bank.all, count, seed });
}

export async function getPkMatch(): Promise<PkMatchPayload> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  const myRating = loadRating(user.id).rating;
  const botSeed = (Date.now() ^ (user.id << 12)) >>> 0;
  const ghost = findGhost(user.id, myRating, botSeed);
  const questions = drawPkQuestions(ghost.seed, ghost.questionCount);
  if (questions.length < ghost.questionCount) {
    // 题库变动导致旧 seed 出不满题：退化为 bot 局（新 seed 一定能出满）
    const bot = botGhost(botSeed, myRating);
    const botQuestions = drawPkQuestions(bot.seed, bot.questionCount);
    if (botQuestions.length < bot.questionCount) {
      return { ok: false, error: "题库不足" };
    }
    return payload(bot, botQuestions, myRating, user.id);
  }
  return payload(ghost, questions, myRating, user.id);
}

function payload(
  ghost: ReturnType<typeof botGhost>,
  questions: QuizQuestion[],
  myRating: number,
  userId: number,
): PkMatchPayload {
  return {
    ok: true,
    seed: ghost.seed,
    questions,
    perks: sessionPerks(getRpgProfile(userId).stats),
    ghost: {
      runId: ghost.runId,
      name: ghost.name,
      rating: ghost.rating,
      outcomes: ghost.outcomes,
      isBot: ghost.isBot,
    },
    myRating,
  };
}

export interface PkSettleResult {
  ok: boolean;
  error?: string;
  /** 1=胜 0.5=平 0=负 */
  result?: 0 | 0.5 | 1;
  ratingBefore?: number;
  ratingAfter?: number;
  rankLabel?: string;
  /** 每日首胜奖励（重复为 0） */
  gained?: number;
  coins?: number;
}

export async function submitPkMatch(
  seed: number,
  ghostRunId: number | null,
  outcomes: PkOutcome[],
): Promise<PkSettleResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  // 幽灵时间线从库里（或 seed）重建，不信客户端转述
  let ghostOutcomes: PkOutcome[];
  let ghostRating: number;
  if (ghostRunId !== null) {
    const run = getRunById(ghostRunId);
    if (!run || run.userId === user.id || run.seed !== seed) {
      return { ok: false, error: "对局不存在" };
    }
    ghostOutcomes = JSON.parse(run.outcomes) as PkOutcome[];
    ghostRating = loadRating(run.userId).rating;
  } else {
    const myRating = loadRating(user.id).rating;
    const bot = botGhost(seed, myRating);
    ghostOutcomes = bot.outcomes;
    ghostRating = bot.rating;
  }

  const count = ghostOutcomes.length;
  if (
    !Array.isArray(outcomes) ||
    outcomes.length !== count ||
    outcomes.some(
      (o) =>
        (o.c !== 0 && o.c !== 1) ||
        !Number.isFinite(o.t) ||
        o.t < 0 ||
        o.t > 120_000,
    )
  ) {
    return { ok: false, error: "非法结果" };
  }

  const now = Date.now();
  const score = outcomes.reduce((s, o) => s + o.c, 0);
  const totalMs = Math.round(outcomes.reduce((s, o) => s + o.t, 0));

  // 我的对局入库（成为别人的幽灵）——注意存的是本场实际 seed
  db.insert(pkRuns)
    .values({
      userId: user.id,
      seed,
      questionCount: count,
      score,
      totalMs,
      outcomes: JSON.stringify(outcomes.map((o) => ({ c: o.c, t: Math.round(o.t) }))),
      createdAt: now,
    })
    .run();

  const result = duelResult(outcomes, ghostOutcomes);
  const before = loadRating(user.id).rating;
  const after = applyElo(before, ghostRating, result);
  db.insert(pkRatings)
    .values({
      userId: user.id,
      rating: after,
      wins: result === 1 ? 1 : 0,
      losses: result === 0 ? 1 : 0,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pkRatings.userId,
      set: {
        rating: after,
        wins: sql`${pkRatings.wins} + ${result === 1 ? 1 : 0}`,
        losses: sql`${pkRatings.losses} + ${result === 0 ? 1 : 0}`,
        updatedAt: now,
      },
    })
    .run();

  // 每日首胜发奖（幂等 ref=日期）；练习/失利不发
  let gained = 0;
  let coins = 0;
  if (result === 1) {
    const inserted = db
      .insert(xpEvents)
      .values({
        userId: user.id,
        amount: 30,
        reason: "pk",
        ref: dailyDateKey(),
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ amount: xpEvents.amount })
      .get();
    if (inserted) {
      gained = inserted.amount;
      coins = 20;
      db.insert(rpgProfiles)
        .values({ userId: user.id, coins, updatedAt: now })
        .onConflictDoUpdate({
          target: rpgProfiles.userId,
          set: { coins: sql`${rpgProfiles.coins} + ${coins}`, updatedAt: now },
        })
        .run();
    }
  }

  return {
    ok: true,
    result,
    ratingBefore: before,
    ratingAfter: after,
    rankLabel: rankFromRating(after).label,
    gained,
    coins,
  };
}
