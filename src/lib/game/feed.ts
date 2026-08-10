import "server-only";

import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { feedEvents, follows, users } from "../db/schema";
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
    };
  });
}
