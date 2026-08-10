import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { feedComments, feedEvents, follows, users } from "../db/schema";

// 动态评论的读侧。可见性沿用动态流本身:只能看「自己 + 关注的人」的动态及其评论。

export interface FeedComment {
  id: number;
  authorId: number;
  authorName: string;
  authorAvatar: string | null;
  body: string;
  isSelf: boolean;
  ago: string;
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

/** 该动态是否在 viewer 的可见范围内(动态属于自己或自己关注的人)。 */
export function canSeeFeed(viewerId: number, feedId: number): boolean {
  const ev = db
    .select({ ownerId: feedEvents.userId })
    .from(feedEvents)
    .where(eq(feedEvents.id, feedId))
    .get();
  if (!ev) return false;
  if (ev.ownerId === viewerId) return true;
  const rel = db
    .select({ id: follows.followeeId })
    .from(follows)
    .where(
      and(eq(follows.followerId, viewerId), eq(follows.followeeId, ev.ownerId)),
    )
    .get();
  return !!rel;
}

/** 一条动态下的评论,按时间正序。viewer 无权见该动态时返回空。 */
export function getFeedComments(viewerId: number, feedId: number): FeedComment[] {
  if (!canSeeFeed(viewerId, feedId)) return [];
  const now = Date.now();
  const rows = db
    .select({
      id: feedComments.id,
      authorId: feedComments.userId,
      body: feedComments.body,
      createdAt: feedComments.createdAt,
      name: users.displayName,
      username: users.username,
      avatar: users.avatar,
    })
    .from(feedComments)
    .innerJoin(users, eq(users.id, feedComments.userId))
    .where(eq(feedComments.feedId, feedId))
    .orderBy(asc(feedComments.createdAt))
    .all();
  return rows.map((r) => ({
    id: r.id,
    authorId: r.authorId,
    authorName: r.name || r.username,
    authorAvatar: r.avatar,
    body: r.body,
    isSelf: r.authorId === viewerId,
    ago: timeAgo(r.createdAt, now),
  }));
}
