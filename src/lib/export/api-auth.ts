import "server-only";

import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { apiTokens } from "../db/schema";
import { hashToken } from "./token";

// 用 Authorization: Bearer <token> 认出用户。命中则顺手更新 lastUsedAt。
// 只读用途——调用方拿 userId 后自行读该用户数据,令牌本身不含任何写权限。
export function userIdFromBearer(authHeader: string | null): number | null {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1].trim();
  if (!token.startsWith("bxt_")) return null;
  const row = db
    .select({ id: apiTokens.id, userId: apiTokens.userId })
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, hashToken(token)))
    .get();
  if (!row) return null;
  db.update(apiTokens)
    .set({ lastUsedAt: Date.now() })
    .where(eq(apiTokens.id, row.id))
    .run();
  return row.userId;
}
