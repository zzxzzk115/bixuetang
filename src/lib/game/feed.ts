import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  feedComments,
  feedEvents,
  feedReactions,
  follows,
  users,
} from "../db/schema";
import { tierByKey } from "./league";

// 好友动态流:里程碑事件的落库与读取。事件在各处「达标即 emit」(幂等),
// 读侧取「自己 + 关注的人」的最近事件,渲染成一句话。

export type FeedType =
  | "course_done"
  | "streak"
  | "tier_up"
  | "achievement"
  | "level_up";

/** 幂等落一条动态:同一 (用户,类型,refKey) 只留一条(里程碑只播一次) */
export function recordFeed(
  userId: number,
  type: FeedType,
  refKey: string,
  payload: Record<string, unknown> = {},
): void {
  db.insert(feedEvents)
    .values({
      userId,
      type,
      refKey,
      payload: JSON.stringify(payload),
      createdAt: Date.now(),
    })
    .onConflictDoNothing()
    .run();
}

export interface FeedItem {
  id: number;
  actorId: number;
  actorName: string;
  actorAvatar: string | null;
  type: FeedType;
  message: string;
  isSelf: boolean;
  createdAt: number;
  /** 相对时间(服务端算好,免得组件里调 Date.now) */
  ago: string;
  /** 点赞数 */
  likeCount: number;
  /** 当前用户是否已赞 */
  liked: boolean;
  /** 评论数 */
  commentCount: number;
}

function timeAgo(ms: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 60) return "刚刚";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(ms + 8 * 3600 * 1000).toISOString().slice(5, 10).replace("-", "/");
}

function renderMessage(type: string, payload: Record<string, unknown>): string {
  switch (type) {
    case "course_done":
      return `完成了课程《${payload.courseTitle ?? "一门课"}》`;
    case "streak":
      return `连续学习达到 ${payload.days ?? 0} 天`;
    case "tier_up":
      return `晋级到「${tierByKey(String(payload.tier ?? "bronze")).label}」段位`;
    case "achievement":
      return `解锁成就「${payload.title ?? ""}」`;
    case "level_up":
      return `升到了 Lv.${payload.level ?? 1}`;
    default:
      return "有了新进展";
  }
}

/** 好友动态:自己 + 关注的人的最近里程碑,按时间倒序 */
export function getFriendFeed(userId: number, limit = 40): FeedItem[] {
  const now = Date.now();
  const followeeIds = db
    .select({ id: follows.followeeId })
    .from(follows)
    .where(eq(follows.followerId, userId))
    .all()
    .map((r) => r.id);
  const ids = [...new Set([userId, ...followeeIds])];

  const rows = db
    .select({
      id: feedEvents.id,
      actorId: feedEvents.userId,
      type: feedEvents.type,
      payload: feedEvents.payload,
      createdAt: feedEvents.createdAt,
      name: users.displayName,
      username: users.username,
      avatar: users.avatar,
    })
    .from(feedEvents)
    .innerJoin(users, eq(users.id, feedEvents.userId))
    .where(inArray(feedEvents.userId, ids))
    .orderBy(desc(feedEvents.createdAt))
    .limit(limit)
    .all();

  // 批量取这批动态的点赞/评论计数与「我是否赞过」,避免逐条查库。
  const feedIds = rows.map((r) => r.id);
  const likeCounts = new Map<number, number>();
  const commentCounts = new Map<number, number>();
  const likedByMe = new Set<number>();
  if (feedIds.length > 0) {
    for (const r of db
      .select({
        feedId: feedReactions.feedId,
        n: sql<number>`count(*)`,
      })
      .from(feedReactions)
      .where(inArray(feedReactions.feedId, feedIds))
      .groupBy(feedReactions.feedId)
      .all())
      likeCounts.set(r.feedId, r.n);
    for (const r of db
      .select({
        feedId: feedComments.feedId,
        n: sql<number>`count(*)`,
      })
      .from(feedComments)
      .where(inArray(feedComments.feedId, feedIds))
      .groupBy(feedComments.feedId)
      .all())
      commentCounts.set(r.feedId, r.n);
    for (const r of db
      .select({ feedId: feedReactions.feedId })
      .from(feedReactions)
      .where(
        and(
          eq(feedReactions.userId, userId),
          inArray(feedReactions.feedId, feedIds),
        ),
      )
      .all())
      likedByMe.add(r.feedId);
  }

  return rows.map((r) => {
    const payload = (() => {
      try {
        return r.payload ? (JSON.parse(r.payload) as Record<string, unknown>) : {};
      } catch {
        return {};
      }
    })();
    return {
      id: r.id,
      actorId: r.actorId,
      actorName: r.name || r.username,
      actorAvatar: r.avatar,
      type: r.type as FeedType,
      message: renderMessage(r.type, payload),
      isSelf: r.actorId === userId,
      createdAt: r.createdAt,
      ago: timeAgo(r.createdAt, now),
      likeCount: likeCounts.get(r.id) ?? 0,
      liked: likedByMe.has(r.id),
      commentCount: commentCounts.get(r.id) ?? 0,
    };
  });
}
