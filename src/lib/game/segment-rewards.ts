import "server-only";

import { and, eq, like, sql } from "drizzle-orm";
import { getContent } from "../content/load";
import type { Course } from "../content/schema";
import { db } from "../db/client";
import { rpgInventory, rpgProfiles, xpEvents } from "../db/schema";
import { buildSegments } from "../segments";
import { potionItemId } from "./boosts";
import { settleBoostedXp } from "./boosts";
import { recordActivity } from "./streak-server";
import type { StreakAdvance } from "./streak";
import {
  episodeRef,
  episodeXp,
  segmentRef,
  segmentXpShare,
  XP_REASON,
} from "./xp";

// 章节(分段)阶段性奖励——心理学锚点:
//   · 目标梯度:70 分钟的课拆成 5 个可完成的小里程碑,每段立刻回报;
//   · 即时反馈:看完一段马上 +XP,不必等整集;
//   · 损失厌恶/习惯养成:看完一个章节就算今天打过卡(连胜推进);
//   · 变率强化:累计章节数触发里程碑宝箱(金币)与药水,间隔不定长。
// 账目守恒:段份额 = 整集 XP 均摊(round5);整集完成时只补差额
// (见 progress/actions.ts),总量不因分段而膨胀(药水加成除外)。

/** 每完成这么多章节开一个金币宝箱 */
export const CHEST_EVERY = 10;
/** 每完成这么多章节送一瓶经验药水(×1.5)入包 */
export const POTION_EVERY = 25;

export interface SegmentSettleItem {
  idx: number;
  title: string;
  xp: number;
}

export interface SegmentRewards {
  settles: SegmentSettleItem[];
  /** 里程碑宝箱金币(0=本次没到里程碑) */
  chestCoins: number;
  /** 本次是否触发药水奖励 */
  potionAwarded: boolean;
  /** 累计完成章节数(里程碑进度感) */
  totalCount: number;
  streak?: StreakAdvance;
}

function segmentEventCount(userId: number): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(xpEvents)
    .where(
      and(eq(xpEvents.userId, userId), eq(xpEvents.reason, XP_REASON.segment)),
    )
    .get();
  return Number(row?.n ?? 0);
}

/**
 * 观看上报后结算「新看完的章节」。prev/next 是该集分段覆盖率数组
 * (×100),跨过 90 的段即为新完成。幂等靠 (user, reason, ref) 唯一键。
 */
export function settleSegments(
  userId: number,
  course: Course,
  episodeN: number,
  prevPct: number[],
  nextPct: number[],
  durationSec: number,
): SegmentRewards | null {
  const analysis = getContent().analysisByCourse.get(course.id);
  const keyPoints = (
    analysis?.episodes.find((e) => e.n === episodeN)?.keyPoints ?? []
  )
    .filter((kp) => typeof kp.t === "number")
    .map((kp) => ({ t: kp.t as number, title: kp.title }));
  const segments = buildSegments({ durationSec, keyPoints });
  if (segments.length < 2) return null;

  const newlyDone = segments.filter(
    (s) => (nextPct[s.idx] ?? 0) >= 90 && (prevPct[s.idx] ?? 0) < 90,
  );
  if (newlyDone.length === 0) return null;

  // 老账号一致性:这一集在分章节机制上线前就拿过整集 XP 的,
  // 重看章节不再发钱、不进宝箱里程碑计数(否则重刷老课就能刷奖励);
  // 但「看了一章」仍算今天打过卡——温故也是学习
  const alreadyScored = db
    .select({ id: xpEvents.id })
    .from(xpEvents)
    .where(
      and(
        eq(xpEvents.userId, userId),
        eq(xpEvents.reason, XP_REASON.episode),
        eq(xpEvents.ref, episodeRef(course.id, episodeN)),
      ),
    )
    .get();
  if (alreadyScored) {
    return {
      settles: [],
      chestCoins: 0,
      potionAwarded: false,
      totalCount: segmentEventCount(userId),
      streak: recordActivity(userId),
    };
  }

  const share = segmentXpShare(
    episodeXp(course.level, durationSec),
    segments.length,
  );
  const now = Date.now();
  const settles: SegmentSettleItem[] = [];
  let chestCoins = 0;
  let potionAwarded = false;

  for (const seg of newlyDone) {
    // 先占幂等键再结算加成——重复上报不重复扣药水
    const inserted = db
      .insert(xpEvents)
      .values({
        userId,
        amount: share,
        reason: XP_REASON.segment,
        ref: segmentRef(course.id, episodeN, seg.idx),
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: xpEvents.id })
      .get();
    if (!inserted) continue;

    const xp = settleBoostedXp(userId, share, { consume: true, roundTo: 5 });
    if (xp !== share) {
      db.update(xpEvents)
        .set({ amount: xp })
        .where(eq(xpEvents.id, inserted.id))
        .run();
    }
    settles.push({ idx: seg.idx, title: seg.title, xp });

    // 里程碑:每 CHEST_EVERY 章一个金币宝箱,每 POTION_EVERY 章一瓶药水。
    // 计数基于刚插入的唯一事件,天然不可重放。
    const count = segmentEventCount(userId);
    if (count % CHEST_EVERY === 0) {
      // 宝箱金额带点波动(30~80),由计数播种——变率强化但可复现
      const coins = 30 + ((count * 7919) % 51);
      chestCoins += coins;
      db.insert(rpgProfiles)
        .values({ userId, coins, updatedAt: now })
        .onConflictDoUpdate({
          target: rpgProfiles.userId,
          set: { coins: sql`${rpgProfiles.coins} + ${coins}`, updatedAt: now },
        })
        .run();
    }
    if (count % POTION_EVERY === 0) {
      potionAwarded = true;
      db.insert(rpgInventory)
        .values({
          userId,
          itemId: potionItemId("x15"),
          quantity: 1,
          acquiredAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [rpgInventory.userId, rpgInventory.itemId],
          set: {
            quantity: sql`${rpgInventory.quantity} + 1`,
            updatedAt: now,
          },
        })
        .run();
    }
  }

  if (settles.length === 0) return null;

  // 看完一个章节也算今天打过卡(同日幂等)
  const streak = recordActivity(userId);

  return {
    settles,
    chestCoins,
    potionAwarded,
    totalCount: segmentEventCount(userId),
    streak,
  };
}

/** 某集已通过章节发放的 XP 总额(整集完成时补差用) */
export function paidSegmentXp(
  userId: number,
  courseId: string,
  episodeN: number,
): number {
  const row = db
    .select({ total: sql<number>`coalesce(sum(${xpEvents.amount}), 0)` })
    .from(xpEvents)
    .where(
      and(
        eq(xpEvents.userId, userId),
        eq(xpEvents.reason, XP_REASON.segment),
        like(xpEvents.ref, `${courseId}:seg:${episodeN}:%`),
      ),
    )
    .get();
  return Number(row?.total ?? 0);
}
