import "server-only";

import { desc, eq, ne } from "drizzle-orm";
import { db } from "../db/client";
import { pkRatings, pkRuns, users } from "../db/schema";
import { INITIAL_RATING, rankFromRating, type PkOutcome } from "./elo";

// 幽灵对战的读侧：排位分、排行榜、幽灵候选。写侧在 pk-actions.ts。

export const PK_COUNT = 8;

export function loadRating(userId: number): {
  rating: number;
  wins: number;
  losses: number;
} {
  const row = db
    .select()
    .from(pkRatings)
    .where(eq(pkRatings.userId, userId))
    .get();
  return {
    rating: row?.rating ?? INITIAL_RATING,
    wins: row?.wins ?? 0,
    losses: row?.losses ?? 0,
  };
}

export interface PkOverview {
  rating: number;
  rankKey: string;
  rankLabel: string;
  wins: number;
  losses: number;
  leaderboard: { name: string; rating: number; rankLabel: string; me: boolean }[];
}

export function getPkOverview(userId: number): PkOverview {
  const mine = loadRating(userId);
  const rows = db
    .select({
      userId: pkRatings.userId,
      rating: pkRatings.rating,
      name: users.displayName,
      username: users.username,
    })
    .from(pkRatings)
    .innerJoin(users, eq(users.id, pkRatings.userId))
    .orderBy(desc(pkRatings.rating))
    .limit(5)
    .all();
  const rank = rankFromRating(mine.rating);
  return {
    rating: mine.rating,
    rankKey: rank.key,
    rankLabel: rank.label,
    wins: mine.wins,
    losses: mine.losses,
    leaderboard: rows.map((r) => ({
      name: r.name || r.username,
      rating: r.rating,
      rankLabel: rankFromRating(r.rating).label,
      me: r.userId === userId,
    })),
  };
}

export interface GhostCandidate {
  runId: number | null;
  ownerId: number | null;
  name: string;
  rating: number;
  seed: number;
  questionCount: number;
  outcomes: PkOutcome[];
  isBot: boolean;
}

/**
 * 找幽灵：其他用户的最近对局里，主人排位分离我最近的一条。
 * 没有别人可打时退化为「训练幽灵」bot（seed 派生的确定性表现，可复现可审计）。
 */
export function findGhost(userId: number, myRating: number, botSeed: number): GhostCandidate {
  const runs = db
    .select({
      id: pkRuns.id,
      userId: pkRuns.userId,
      seed: pkRuns.seed,
      questionCount: pkRuns.questionCount,
      outcomes: pkRuns.outcomes,
      name: users.displayName,
      username: users.username,
    })
    .from(pkRuns)
    .innerJoin(users, eq(users.id, pkRuns.userId))
    .where(ne(pkRuns.userId, userId))
    .orderBy(desc(pkRuns.id))
    .limit(50)
    .all();

  let best: (typeof runs)[number] | null = null;
  let bestGap = Infinity;
  const seenOwner = new Set<number>();
  for (const run of runs) {
    // 每人只取最近一条，防止同一个人的旧局刷屏
    if (seenOwner.has(run.userId)) continue;
    seenOwner.add(run.userId);
    const gap = Math.abs(loadRating(run.userId).rating - myRating);
    if (gap < bestGap) {
      bestGap = gap;
      best = run;
    }
  }

  if (best) {
    return {
      runId: best.id,
      ownerId: best.userId,
      name: best.name || best.username,
      rating: loadRating(best.userId).rating,
      seed: best.seed,
      questionCount: best.questionCount,
      outcomes: JSON.parse(best.outcomes) as PkOutcome[],
      isBot: false,
    };
  }
  return botGhost(botSeed, myRating);
}

/**
 * 约战好友：指定好友的最近一场对局录像作幽灵。TA 没打过则返回 null
 * （约战方需先有对局才能被挑战）。
 */
export function findFriendGhost(
  userId: number,
  friendId: number,
): GhostCandidate | null {
  if (friendId === userId) return null;
  const run = db
    .select({
      id: pkRuns.id,
      userId: pkRuns.userId,
      seed: pkRuns.seed,
      questionCount: pkRuns.questionCount,
      outcomes: pkRuns.outcomes,
      name: users.displayName,
      username: users.username,
    })
    .from(pkRuns)
    .innerJoin(users, eq(users.id, pkRuns.userId))
    .where(eq(pkRuns.userId, friendId))
    .orderBy(desc(pkRuns.id))
    .limit(1)
    .get();
  if (!run) return null;
  return {
    runId: run.id,
    ownerId: run.userId,
    name: run.name || run.username,
    rating: loadRating(run.userId).rating,
    seed: run.seed,
    questionCount: run.questionCount,
    outcomes: JSON.parse(run.outcomes) as PkOutcome[],
    isBot: false,
  };
}

/** bot 幽灵：表现由 seed 确定（答对率 ~55%，用时 4~13s），强度与排位无关 */
export function botGhost(seed: number, myRating: number): GhostCandidate {
  let a = (seed ^ 0xb07) >>> 0;
  const rand = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const outcomes: PkOutcome[] = Array.from({ length: PK_COUNT }, () => ({
    c: rand() < 0.55 ? 1 : 0,
    t: Math.round(4000 + rand() * 9000),
  }));
  return {
    runId: null,
    ownerId: null,
    name: "训练幽灵",
    rating: Math.max(INITIAL_RATING, myRating - 50),
    seed,
    questionCount: PK_COUNT,
    outcomes,
    isBot: true,
  };
}

export function getRunById(runId: number) {
  return db.select().from(pkRuns).where(eq(pkRuns.id, runId)).get();
}
