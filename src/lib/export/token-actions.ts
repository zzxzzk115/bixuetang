"use server";

import { and, desc, eq } from "drizzle-orm";
import { getCurrentUser } from "../auth/session";
import { db } from "../db/client";
import { apiTokens } from "../db/schema";
import { containsSensitive } from "../moderation/filter";
import { generateToken } from "./token";

// 个人 API 令牌的增/查/删。明文令牌只在 create 的返回值里出现一次。

const MAX_TOKENS = 10;

export interface ApiTokenView {
  id: number;
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
}

export async function listApiTokens(): Promise<ApiTokenView[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  return db
    .select({
      id: apiTokens.id,
      label: apiTokens.label,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, user.id))
    .orderBy(desc(apiTokens.id))
    .all();
}

export async function createApiToken(
  labelRaw: string,
): Promise<{ ok: boolean; token?: string; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "未登录" };
  const label = labelRaw.trim().slice(0, 40) || "未命名令牌";
  if (containsSensitive(label)) return { ok: false, error: "名称含敏感词" };

  const count = db
    .select({ id: apiTokens.id })
    .from(apiTokens)
    .where(eq(apiTokens.userId, user.id))
    .all().length;
  if (count >= MAX_TOKENS) return { ok: false, error: `最多 ${MAX_TOKENS} 个令牌` };

  const { token, hash } = generateToken();
  db.insert(apiTokens)
    .values({ userId: user.id, tokenHash: hash, label, createdAt: Date.now() })
    .run();
  return { ok: true, token };
}

export async function revokeApiToken(id: number): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  db.delete(apiTokens)
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, user.id)))
    .run();
  return { ok: true };
}
