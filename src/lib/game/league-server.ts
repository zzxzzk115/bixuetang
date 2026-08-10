import "server-only";

import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "../db/client";
import { leagueMeta, leagueStanding, users, xpEvents } from "../db/schema";
import {
  settleTier,
  START_TIER,
  tierByIndex,
  tierByKey,
  tierIndex,
  weekIndex,
  weekRange,
  zoneCounts,
  type LeagueMember,
} from "./league";
import { recordFeed } from "./feed";

// 段位联赛的服务端读写:惰性全服结算 + 当前周联赛总览。段位规则在纯模块 league.ts。

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Exec = typeof db | DbTx;

/** 汇总一批用户在 [start,end) 内的经验(按 xp_events 求和)。返回 Map<userId, xp>。 */
function weekXpByUser(
  exec: Exec,
  userIds: number[],
  start: number,
  end: number,
): Map<number, number> {
  const map = new Map<number, number>();
  if (userIds.length === 0) return map;
  const rows = exec
    .select({ userId: xpEvents.userId, xp: sql<number>`sum(${xpEvents.amount})` })
    .from(xpEvents)
    .where(
      and(
        inArray(xpEvents.userId, userIds),
        gte(xpEvents.createdAt, start),
        lt(xpEvents.createdAt, end),
      ),
    )
    .groupBy(xpEvents.userId)
    .all();
  for (const r of rows) map.set(r.userId, Number(r.xp) || 0);
  return map;
}

/** 结算某一(已完成)周:按各段位当前成员的当周经验升降段,写回段位与待展示结果。 */
function settleWeek(tx: DbTx, w: number, now: number) {
  const { start, end } = weekRange(w);
  const standings = tx.select().from(leagueStanding).all();
  if (standings.length === 0) return;
  const xpMap = weekXpByUser(
    tx,
    standings.map((s) => s.userId),
    start,
    end,
  );
  const byTier = new Map<number, LeagueMember[]>();
  for (const s of standings) {
    const ti = tierIndex(s.tier);
    const bucket = byTier.get(ti) ?? [];
    bucket.push({ userId: s.userId, weekXp: xpMap.get(s.userId) ?? 0 });
    byTier.set(ti, bucket);
  }
  for (const [ti, members] of byTier) {
    for (const o of settleTier(ti, members)) {
      if (o.result === "stay") {
        tx.update(leagueStanding)
          .set({ settledWeek: w, updatedAt: now })
          .where(eq(leagueStanding.userId, o.userId))
          .run();
      } else {
        const toKey = tierByIndex(o.toTier).key;
        tx.update(leagueStanding)
          .set({
            tier: toKey,
            settledWeek: w,
            pendingResult: o.result,
            pendingFromTier: tierByIndex(o.fromTier).key,
            pendingToTier: toKey,
            updatedAt: now,
          })
          .where(eq(leagueStanding.userId, o.userId))
          .run();
        // 晋级才播动态(掉段不声张);幂等键含周序号,每次晋级各一条
        if (o.result === "promote") {
          recordFeed(o.userId, "tier_up", `w${w}:${toKey}`, { tier: toKey });
        }
      }
    }
  }
}

/**
 * 惰性全服结算:把「已完成但未结算」的周逐周结算(meta.settledWeek+1 .. 当前周-1)。
 * 谁在新一周首次打开排位页,谁就触发;用 league_meta 单行 + 事务去重,只结算一次。
 */
export function settleLeague(now: number) {
  const curWeek = weekIndex(now);
  db.transaction((tx) => {
    const meta = tx.select().from(leagueMeta).where(eq(leagueMeta.id, 1)).get();
    if (!meta) {
      // 首次:视为已结算到上一周,不追溯历史(此前根本没有联赛)
      tx.insert(leagueMeta).values({ id: 1, settledWeek: curWeek - 1 }).run();
      return;
    }
    if (curWeek - 1 <= meta.settledWeek) return; // 本周尚未产生可结算的完整周
    for (let w = meta.settledWeek + 1; w <= curWeek - 1; w++) settleWeek(tx, w, now);
    tx.update(leagueMeta)
      .set({ settledWeek: curWeek - 1 })
      .where(eq(leagueMeta.id, 1))
      .run();
  });
}

/** 确保用户有段位行(新人青铜起步,结算游标设为上一周,不追溯) */
function ensureStanding(userId: number, curWeek: number, now: number) {
  db.insert(leagueStanding)
    .values({ userId, tier: START_TIER, settledWeek: curWeek - 1, updatedAt: now })
    .onConflictDoNothing()
    .run();
  return db
    .select()
    .from(leagueStanding)
    .where(eq(leagueStanding.userId, userId))
    .get()!;
}

export type LeagueZone = "promote" | "demote" | "hold";

export interface LeagueRow {
  name: string;
  weekXp: number;
  rank: number;
  zone: LeagueZone;
  me: boolean;
}

export interface LeagueOverview {
  tierKey: string;
  tierLabel: string;
  tierColorVar: string;
  tierIndex: number;
  weekXp: number;
  myRank: number;
  cohortSize: number;
  promoteCount: number;
  demoteCount: number;
  /** 赛季(本周)结束时间戳(ms) */
  seasonEnd: number;
  board: LeagueRow[];
  /** 上次结算结果,供弹一次横幅;未结算/已确认为 null */
  pending: {
    result: "promote" | "demote";
    fromLabel: string;
    toLabel: string;
    toColorVar: string;
  } | null;
}

export function getLeagueOverview(userId: number, now = Date.now()): LeagueOverview {
  settleLeague(now);
  const curWeek = weekIndex(now);
  const me = ensureStanding(userId, curWeek, now);
  const ti = tierIndex(me.tier);

  const cohort = db
    .select({
      userId: leagueStanding.userId,
      name: users.displayName,
      username: users.username,
    })
    .from(leagueStanding)
    .innerJoin(users, eq(users.id, leagueStanding.userId))
    .where(eq(leagueStanding.tier, me.tier))
    .all();

  const { start, end } = weekRange(curWeek);
  const xpMap = weekXpByUser(db, cohort.map((c) => c.userId), start, end);
  const ranked = cohort
    .map((c) => ({
      userId: c.userId,
      name: c.name || c.username,
      weekXp: xpMap.get(c.userId) ?? 0,
    }))
    .sort((a, b) => b.weekXp - a.weekXp || a.userId - b.userId);

  const activeN = ranked.filter((r) => r.weekXp > 0).length;
  const { promote, demote } = zoneCounts(ti, activeN);

  const allRows: LeagueRow[] = ranked.map((r, i) => {
    const active = r.weekXp > 0;
    const zone: LeagueZone =
      active && i < promote
        ? "promote"
        : active && i >= activeN - demote
          ? "demote"
          : "hold";
    return { name: r.name, weekXp: r.weekXp, rank: i + 1, zone, me: r.userId === userId };
  });

  const myRank = allRows.find((r) => r.me)?.rank ?? ranked.length;
  // 榜单截断到前 20;若我在 20 名开外,补上我自己那行
  let board = allRows.slice(0, 20);
  if (!board.some((r) => r.me)) {
    const mine = allRows.find((r) => r.me);
    if (mine) board = [...board, mine];
  }

  const tier = tierByKey(me.tier);
  const pending = me.pendingResult
    ? {
        result: me.pendingResult as "promote" | "demote",
        fromLabel: tierByKey(me.pendingFromTier ?? me.tier).label,
        toLabel: tierByKey(me.pendingToTier ?? me.tier).label,
        toColorVar: tierByKey(me.pendingToTier ?? me.tier).colorVar,
      }
    : null;

  return {
    tierKey: tier.key,
    tierLabel: tier.label,
    tierColorVar: tier.colorVar,
    tierIndex: ti,
    weekXp: xpMap.get(userId) ?? 0,
    myRank,
    cohortSize: cohort.length,
    promoteCount: promote,
    demoteCount: demote,
    seasonEnd: end,
    board,
    pending,
  };
}
