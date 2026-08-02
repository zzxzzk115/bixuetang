import "server-only";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { apiTokens, users } from "../db/schema";
import type { SessionUser } from "./session";

// 浏览器插件鉴权：长效 Bearer token（插件跨域拿不到 cookie）。
// 明文只在生成时返回一次，库里只存 SHA-256。

const PREFIX = "guild_";

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function createApiToken(userId: number, label: string): string {
  const token = PREFIX + crypto.randomBytes(24).toString("base64url");
  db.insert(apiTokens)
    .values({
      tokenHash: sha256(token),
      userId,
      label: label.slice(0, 40) || "浏览器插件",
      createdAt: Date.now(),
    })
    .run();
  return token;
}

export function listApiTokens(userId: number) {
  return db
    .select({
      tokenHash: apiTokens.tokenHash,
      label: apiTokens.label,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .all();
}

export function revokeApiToken(userId: number, tokenHash: string): void {
  const row = db
    .select({ userId: apiTokens.userId })
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, tokenHash))
    .get();
  if (row?.userId !== userId) return; // 不是自己的 token，静默忽略
  db.delete(apiTokens).where(eq(apiTokens.tokenHash, tokenHash)).run();
}

/** 校验 Authorization: Bearer <token>，成功则返回用户并刷新 lastUsedAt */
export function userFromAuthHeader(header: string | null): SessionUser | null {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const hash = sha256(token);
  const row = db
    .select()
    .from(apiTokens)
    .innerJoin(users, eq(apiTokens.userId, users.id))
    .where(eq(apiTokens.tokenHash, hash))
    .get();
  if (!row) return null;
  db.update(apiTokens)
    .set({ lastUsedAt: Date.now() })
    .where(eq(apiTokens.tokenHash, hash))
    .run();
  return row.users;
}
