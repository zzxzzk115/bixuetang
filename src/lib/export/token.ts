import "server-only";

import { createHash, randomBytes } from "node:crypto";

// 个人 API 令牌:明文形如 bxt_<base64url>,只在创建时返回一次;库里只存 sha256 哈希。

export function generateToken(): { token: string; hash: string } {
  const token = "bxt_" + randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** 展示用掩码:bxt_abcd…wxyz */
export function maskToken(token: string): string {
  if (token.length <= 12) return token;
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}
