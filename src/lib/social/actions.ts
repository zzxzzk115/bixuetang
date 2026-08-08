"use server";

import { and, eq, inArray, like, ne, or } from "drizzle-orm";
import { getCurrentUser } from "../auth/session";
import { db } from "../db/client";
import { follows, users } from "../db/schema";
import { RATE, overRateLimit } from "../moderation/ratelimit";

// 关注/取关 + 找人。好友 = 你关注的人;经邀请注册的双方自动互关(见 invite.ts)。

export interface SearchRow {
  id: number;
  name: string;
  avatar: string | null;
  followed: boolean;
}

export async function searchUsers(query: string): Promise<SearchRow[]> {
  const me = await getCurrentUser();
  if (!me) return [];
  const q = query.trim().replace(/[%_]/g, "");
  if (!q) return [];
  const pat = `%${q}%`;
  const rows = db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatar: users.avatar,
    })
    .from(users)
    .where(
      and(
        ne(users.id, me.id),
        or(like(users.username, pat), like(users.displayName, pat)),
      ),
    )
    .limit(20)
    .all();

  const ids = rows.map((r) => r.id);
  const followedSet = new Set(
    ids.length
      ? db
          .select({ id: follows.followeeId })
          .from(follows)
          .where(
            and(
              eq(follows.followerId, me.id),
              inArray(follows.followeeId, ids),
            ),
          )
          .all()
          .map((r) => r.id)
      : [],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.displayName || r.username,
    avatar: r.avatar,
    followed: followedSet.has(r.id),
  }));
}

export async function followUser(targetId: number): Promise<{ ok: boolean }> {
  const me = await getCurrentUser();
  if (!me || !Number.isInteger(targetId) || targetId === me.id) {
    return { ok: false };
  }
  const exists = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, targetId))
    .get();
  if (!exists) return { ok: false };
  if (
    overRateLimit(
      follows,
      follows.followerId,
      follows.createdAt,
      me.id,
      RATE.follow,
    )
  )
    return { ok: false };
  db.insert(follows)
    .values({ followerId: me.id, followeeId: targetId, createdAt: Date.now() })
    .onConflictDoNothing()
    .run();
  return { ok: true };
}

export async function unfollowUser(targetId: number): Promise<{ ok: boolean }> {
  const me = await getCurrentUser();
  if (!me) return { ok: false };
  db.delete(follows)
    .where(
      and(eq(follows.followerId, me.id), eq(follows.followeeId, targetId)),
    )
    .run();
  return { ok: true };
}
