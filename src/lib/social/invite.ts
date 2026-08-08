import "server-only";

import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { follows, rpgProfiles, users, xpEvents } from "../db/schema";

// 邀请闭环:注册时把邀请人与被邀人互相关注;被邀人完成上手引导时给邀请人发奖。
// 发奖放在「完成引导」而非「注册瞬间」,是一道轻门槛,挡纯刷号。

const INVITE_XP = 50;
const INVITE_COINS = 100;

/** 邀请人 ↔ 被邀人 互相关注(经邀请链接注册时调用) */
export function linkInviteFollow(inviterId: number, inviteeId: number): void {
  if (inviterId === inviteeId) return;
  const now = Date.now();
  db.insert(follows)
    .values([
      { followerId: inviterId, followeeId: inviteeId, createdAt: now },
      { followerId: inviteeId, followeeId: inviterId, createdAt: now },
    ])
    .onConflictDoNothing()
    .run();
}

/** 被邀人完成上手引导 → 给邀请人发奖。幂等:每个被邀人只发一次 */
export function grantInviteReward(inviteeId: number): void {
  const invitee = db
    .select({ referredBy: users.referredBy })
    .from(users)
    .where(eq(users.id, inviteeId))
    .get();
  const inviterId = invitee?.referredBy;
  if (!inviterId || inviterId === inviteeId) return;

  const now = Date.now();
  // reason+ref 唯一:同一个被邀人只给邀请人发一次
  const inserted = db
    .insert(xpEvents)
    .values({
      userId: inviterId,
      amount: INVITE_XP,
      reason: "invite",
      ref: String(inviteeId),
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ amount: xpEvents.amount })
    .get();
  if (!inserted) return; // 已发过

  db.insert(rpgProfiles)
    .values({ userId: inviterId, coins: INVITE_COINS, updatedAt: now })
    .onConflictDoUpdate({
      target: rpgProfiles.userId,
      set: { coins: sql`${rpgProfiles.coins} + ${INVITE_COINS}`, updatedAt: now },
    })
    .run();
}
