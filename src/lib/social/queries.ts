import "server-only";

import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { follows, pkRatings, users, xpEvents } from "../db/schema";
import { rankFromRating } from "../game/elo";
import { levelFromXp } from "../game/level";

// 社交读侧:好友榜(自己 + 关注的人,按总 XP 排,带等级与 PK 段位)、社交统计。

export interface FriendRow {
  userId: number;
  name: string;
  avatar: string | null;
  totalXp: number;
  level: number;
  rating: number;
  rankKey: string;
  rankLabel: string;
  isSelf: boolean;
}

/** userId 关注的人的 id 列表 */
export function getFolloweeIds(userId: number): number[] {
  return db
    .select({ id: follows.followeeId })
    .from(follows)
    .where(eq(follows.followerId, userId))
    .all()
    .map((r) => r.id);
}

/** 好友榜:自己 + 关注的人,按总 XP 降序 */
export function getFriendLeaderboard(userId: number): FriendRow[] {
  const ids = [...new Set([userId, ...getFolloweeIds(userId)])];

  const xpRows = db
    .select({
      userId: xpEvents.userId,
      total: sql<number>`coalesce(sum(${xpEvents.amount}), 0)`,
    })
    .from(xpEvents)
    .where(inArray(xpEvents.userId, ids))
    .groupBy(xpEvents.userId)
    .all();
  const xpMap = new Map(xpRows.map((r) => [r.userId, Number(r.total)]));

  const uRows = db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatar: users.avatar,
    })
    .from(users)
    .where(inArray(users.id, ids))
    .all();

  const rRows = db
    .select({ userId: pkRatings.userId, rating: pkRatings.rating })
    .from(pkRatings)
    .where(inArray(pkRatings.userId, ids))
    .all();
  const rMap = new Map(rRows.map((r) => [r.userId, r.rating]));

  const rows: FriendRow[] = uRows.map((u) => {
    const totalXp = xpMap.get(u.id) ?? 0;
    const rating = rMap.get(u.id) ?? 1000;
    const rank = rankFromRating(rating);
    return {
      userId: u.id,
      name: u.displayName || u.username,
      avatar: u.avatar,
      totalXp,
      level: levelFromXp(totalXp),
      rating,
      rankKey: rank.key,
      rankLabel: rank.label,
      isSelf: u.id === userId,
    };
  });
  rows.sort((a, z) => z.totalXp - a.totalXp || a.userId - z.userId);
  return rows;
}

export interface SocialStats {
  following: number;
  invited: number;
}

export function getSocialStats(userId: number): SocialStats {
  const following =
    db
      .select({ n: sql<number>`count(*)` })
      .from(follows)
      .where(eq(follows.followerId, userId))
      .get()?.n ?? 0;
  const invited =
    db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.referredBy, userId))
      .get()?.n ?? 0;
  return { following: Number(following), invited: Number(invited) };
}
