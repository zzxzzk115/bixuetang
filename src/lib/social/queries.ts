import "server-only";

import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { follows, leagueStanding, streakState, users, xpEvents } from "../db/schema";
import { tierByKey } from "../game/league";
import { levelFromXp } from "../game/level";

// 社交读侧:好友榜(自己 + 关注的人,按总 XP 排,带等级、联赛段位与连胜)、社交统计。

export interface FriendRow {
  userId: number;
  name: string;
  avatar: string | null;
  totalXp: number;
  level: number;
  rankKey: string;
  rankLabel: string;
  /** 当前连胜天数(社交可见,互相较劲) */
  streak: number;
  isSelf: boolean;
  /** 这个我关注的人,是否也回关了我(互相关注) */
  followsMe: boolean;
}

/** 取某用户的展示名(约战横幅等用),不存在返回 null。 */
export function getPublicName(userId: number): string | null {
  if (!Number.isInteger(userId)) return null;
  const u = db
    .select({ displayName: users.displayName, username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return u ? u.displayName || u.username : null;
}

/** userId 的粉丝(关注我的人)的 id 列表 */
export function getFollowerIds(userId: number): number[] {
  return db
    .select({ id: follows.followerId })
    .from(follows)
    .where(eq(follows.followeeId, userId))
    .all()
    .map((r) => r.id);
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

/** 好友榜:自己 + 关注的人,按总 XP 降序;标出谁回关了我(互关) */
export function getFriendLeaderboard(userId: number): FriendRow[] {
  const ids = [...new Set([userId, ...getFolloweeIds(userId)])];
  const followerSet = new Set(getFollowerIds(userId));

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

  const tRows = db
    .select({ userId: leagueStanding.userId, tier: leagueStanding.tier })
    .from(leagueStanding)
    .where(inArray(leagueStanding.userId, ids))
    .all();
  const tierMap = new Map(tRows.map((r) => [r.userId, r.tier]));

  const sRows = db
    .select({ userId: streakState.userId, current: streakState.current })
    .from(streakState)
    .where(inArray(streakState.userId, ids))
    .all();
  const streakMap = new Map(sRows.map((r) => [r.userId, r.current]));

  const rows: FriendRow[] = uRows.map((u) => {
    const totalXp = xpMap.get(u.id) ?? 0;
    const tier = tierByKey(tierMap.get(u.id) ?? "bronze");
    return {
      userId: u.id,
      name: u.displayName || u.username,
      avatar: u.avatar,
      totalXp,
      level: levelFromXp(totalXp),
      rankKey: tier.key,
      rankLabel: tier.label,
      streak: streakMap.get(u.id) ?? 0,
      isSelf: u.id === userId,
      followsMe: followerSet.has(u.id),
    };
  });
  rows.sort((a, z) => z.totalXp - a.totalXp || a.userId - z.userId);
  return rows;
}

export interface FollowerRow {
  userId: number;
  name: string;
  avatar: string | null;
  /** 我是否已回关 TA */
  iFollowBack: boolean;
}

/** 关注我的人(粉丝),标出我是否已回关;未回关的排前面好回关 */
export function getFollowers(userId: number): FollowerRow[] {
  const followerIds = getFollowerIds(userId);
  if (!followerIds.length) return [];
  const followeeSet = new Set(getFolloweeIds(userId));
  const uRows = db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatar: users.avatar,
    })
    .from(users)
    .where(inArray(users.id, followerIds))
    .all();
  return uRows
    .map((u) => ({
      userId: u.id,
      name: u.displayName || u.username,
      avatar: u.avatar,
      iFollowBack: followeeSet.has(u.id),
    }))
    .sort((a, z) => Number(a.iFollowBack) - Number(z.iFollowBack));
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
