"use server";

import { eq } from "drizzle-orm";
import { getCurrentUser } from "../auth/session";
import { db } from "../db/client";
import { studyPresence, studyRooms } from "../db/schema";
import { containsSensitive } from "../moderation/filter";
import { getRoom } from "./study";
import type { RoomView } from "./study-types";

// 自习室写侧:进入 / 心跳(续命并拉最新在场) / 离开 / 建房。

export async function enterRoom(roomId: number): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user || !Number.isInteger(roomId)) return { ok: false };
  const room = db
    .select({ id: studyRooms.id })
    .from(studyRooms)
    .where(eq(studyRooms.id, roomId))
    .get();
  if (!room) return { ok: false };
  const now = Date.now();
  db.insert(studyPresence)
    .values({ userId: user.id, roomId, enteredAt: now, lastSeenAt: now })
    .onConflictDoUpdate({
      target: studyPresence.userId,
      set: { roomId, enteredAt: now, lastSeenAt: now },
    })
    .run();
  return { ok: true };
}

export async function heartbeat(roomId: number): Promise<RoomView | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  db.update(studyPresence)
    .set({ lastSeenAt: Date.now() })
    .where(eq(studyPresence.userId, user.id))
    .run();
  return getRoom(roomId);
}

export async function leaveRoom(): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  db.delete(studyPresence).where(eq(studyPresence.userId, user.id)).run();
  return { ok: true };
}

export async function createRoom(
  name: string,
): Promise<{ ok: boolean; id?: number; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const n = name.trim().slice(0, 20);
  if (!n) return { ok: false, error: "给自习室起个名字吧" };
  if (containsSensitive(n)) return { ok: false, error: "名称含有不当词汇" };
  const now = Date.now();
  const r = db
    .insert(studyRooms)
    .values({ name: n, emoji: "✏️", createdBy: user.id, createdAt: now })
    .returning({ id: studyRooms.id })
    .get();
  return { ok: true, id: r.id };
}
