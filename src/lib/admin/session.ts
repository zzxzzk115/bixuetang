import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, lt } from "drizzle-orm";
import { cache } from "react";
import { db } from "../db/client";
import { adminSessions, adminUsers } from "../db/schema";

// 管理端鉴权域,与游戏端(guild_session / users)完全隔离:独立 cookie、独立表。
// token 生成/存储沿用游戏端范式(存 SHA-256,泄库不泄 token)。

const COOKIE_NAME = "admin_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 管理端 7 天,比游戏端短
const COOKIE_SECURE = process.env.COOKIE_SECURE === "1";

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export type AdminUser = typeof adminUsers.$inferSelect;

export async function createAdminSession(adminUserId: number): Promise<void> {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  db.insert(adminSessions)
    .values({
      tokenHash: sha256(token),
      adminUserId,
      expiresAt: now + SESSION_TTL_MS,
      createdAt: now,
    })
    .run();
  db.delete(adminSessions).where(lt(adminSessions.expiresAt, now)).run();

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function destroyAdminSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) {
    db.delete(adminSessions).where(eq(adminSessions.tokenHash, sha256(token))).run();
  }
  store.delete(COOKIE_NAME);
}

export const getCurrentAdmin = cache(async (): Promise<AdminUser | null> => {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const row = db
    .select()
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminSessions.adminUserId, adminUsers.id))
    .where(eq(adminSessions.tokenHash, sha256(token)))
    .get();

  if (!row || row.admin_sessions.expiresAt < Date.now()) return null;
  return row.admin_users;
});

/** 页面/动作守卫:未登录跳管理端登录页 */
export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/console/login");
  return admin;
}
