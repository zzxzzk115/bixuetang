import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, lt } from "drizzle-orm";
import { cache } from "react";
import { db } from "../db/client";
import { sessions, users } from "../db/schema";

const COOKIE_NAME = "guild_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

// 自托管常走 http://局域网IP，强制 Secure 会直接登不上；HTTPS 部署时设 COOKIE_SECURE=1
const COOKIE_SECURE = process.env.COOKIE_SECURE === "1";

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function createSession(userId: number): Promise<void> {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  db.insert(sessions)
    .values({
      tokenHash: sha256(token),
      userId,
      expiresAt: now + SESSION_TTL_MS,
      createdAt: now,
    })
    .run();
  // 顺手清理过期 session
  db.delete(sessions).where(lt(sessions.expiresAt, now)).run();

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) {
    db.delete(sessions).where(eq(sessions.tokenHash, sha256(token))).run();
  }
  store.delete(COOKIE_NAME);
}

export type SessionUser = typeof users.$inferSelect;

// React cache：同一请求内多处调用只查一次库
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const row = db
    .select()
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, sha256(token)))
    .get();

  if (!row || row.sessions.expiresAt < Date.now()) return null;
  return row.users;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
