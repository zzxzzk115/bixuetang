import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/client";
import { studyPresence, studyRooms, users } from "../db/schema";
import {
  PRESENCE_ALIVE_MS,
  type RoomSummary,
  type RoomView,
} from "./study-types";

// 自习室读侧。在场 = 存活窗口内有心跳的人。

export function getRooms(): RoomSummary[] {
  const cutoff = Date.now() - PRESENCE_ALIVE_MS;
  const rooms = db.select().from(studyRooms).all();
  const counts = db
    .select({ roomId: studyPresence.roomId, n: sql<number>`count(*)` })
    .from(studyPresence)
    .where(gte(studyPresence.lastSeenAt, cutoff))
    .groupBy(studyPresence.roomId)
    .all();
  const cmap = new Map(counts.map((c) => [c.roomId, Number(c.n)]));
  return rooms
    .map((r) => ({
      id: r.id,
      name: r.name,
      emoji: r.emoji,
      count: cmap.get(r.id) ?? 0,
    }))
    .sort((a, z) => z.count - a.count || a.id - z.id);
}

export function getRoom(roomId: number): RoomView | null {
  const room = db
    .select()
    .from(studyRooms)
    .where(eq(studyRooms.id, roomId))
    .get();
  if (!room) return null;
  const cutoff = Date.now() - PRESENCE_ALIVE_MS;
  const rows = db
    .select({
      userId: studyPresence.userId,
      enteredAt: studyPresence.enteredAt,
      displayName: users.displayName,
      username: users.username,
      avatar: users.avatar,
    })
    .from(studyPresence)
    .innerJoin(users, eq(users.id, studyPresence.userId))
    .where(
      and(eq(studyPresence.roomId, roomId), gte(studyPresence.lastSeenAt, cutoff)),
    )
    .orderBy(studyPresence.enteredAt)
    .all();
  const now = Date.now();
  return {
    id: room.id,
    name: room.name,
    emoji: room.emoji,
    members: rows.map((r) => ({
      userId: r.userId,
      name: r.displayName || r.username,
      avatar: r.avatar,
      minutes: Math.max(0, Math.floor((now - r.enteredAt) / 60000)),
    })),
  };
}

/** 我当前在哪个房间(不在则 null) */
export function getMyRoomId(userId: number): number | null {
  const p = db
    .select({ roomId: studyPresence.roomId, lastSeenAt: studyPresence.lastSeenAt })
    .from(studyPresence)
    .where(eq(studyPresence.userId, userId))
    .get();
  if (!p) return null;
  if (p.lastSeenAt < Date.now() - PRESENCE_ALIVE_MS) return null; // 早退未清理
  return p.roomId;
}
