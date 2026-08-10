"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth/session";
import { db } from "../db/client";
import { feedComments, feedReactions } from "../db/schema";
import { containsSensitive } from "../moderation/filter";
import { RATE, overRateLimit } from "../moderation/ratelimit";
import {
  canSeeFeed,
  getFeedComments,
  type FeedComment,
} from "./feed-social";

// 好友动态的互动写侧:点赞(幂等切换)、评论(过敏感词+限流)、删自己的评论。
// 可见性交给 canSeeFeed:只能给「自己/关注的人」的动态点赞评论。

export async function toggleFeedLike(
  feedId: number,
): Promise<{ ok: boolean; liked?: boolean; count?: number; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };
  if (!Number.isInteger(feedId) || !canSeeFeed(user.id, feedId))
    return { ok: false };

  const existing = db
    .select({ feedId: feedReactions.feedId })
    .from(feedReactions)
    .where(
      and(eq(feedReactions.feedId, feedId), eq(feedReactions.userId, user.id)),
    )
    .get();

  let liked: boolean;
  if (existing) {
    db.delete(feedReactions)
      .where(
        and(
          eq(feedReactions.feedId, feedId),
          eq(feedReactions.userId, user.id),
        ),
      )
      .run();
    liked = false;
  } else {
    db.insert(feedReactions)
      .values({ feedId, userId: user.id, createdAt: Date.now() })
      .onConflictDoNothing()
      .run();
    liked = true;
  }

  const count = db
    .select({ feedId: feedReactions.feedId })
    .from(feedReactions)
    .where(eq(feedReactions.feedId, feedId))
    .all().length;

  revalidatePath("/social");
  return { ok: true, liked, count };
}

export async function addFeedComment(
  feedId: number,
  text: string,
): Promise<{ ok: boolean; comment?: FeedComment; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };
  if (!Number.isInteger(feedId) || !canSeeFeed(user.id, feedId))
    return { ok: false };
  const body = text.trim().slice(0, 200);
  if (!body) return { ok: false, error: "说点什么再发吧" };
  if (containsSensitive(body))
    return { ok: false, error: "内容含有不当词汇,请修改" };
  if (
    overRateLimit(
      feedComments,
      feedComments.userId,
      feedComments.createdAt,
      user.id,
      RATE.feedComment,
    )
  )
    return { ok: false, error: "评论太频繁了,过会儿再来吧" };

  const row = db
    .insert(feedComments)
    .values({ feedId, userId: user.id, body, createdAt: Date.now() })
    .returning({ id: feedComments.id })
    .get();

  revalidatePath("/social");
  return {
    ok: true,
    comment: {
      id: row.id,
      authorId: user.id,
      authorName: user.displayName || user.username,
      authorAvatar: user.avatar,
      body,
      isSelf: true,
      ago: "刚刚",
    },
  };
}

export async function deleteFeedComment(id: number): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  db.delete(feedComments)
    .where(and(eq(feedComments.id, id), eq(feedComments.userId, user.id)))
    .run();
  revalidatePath("/social");
  return { ok: true };
}

/** 展开评论区时按需拉取(客户端调用)。 */
export async function loadFeedComments(
  feedId: number,
): Promise<FeedComment[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  return getFeedComments(user.id, feedId);
}
