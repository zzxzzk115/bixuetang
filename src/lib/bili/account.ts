import "server-only";

import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { biliAccounts } from "../db/schema";

// 绑定账号的读写。SESSDATA 只在服务端流转（播放代理、取高清地址），
// 任何面向客户端的 DTO 都不含凭据。

export interface BiliBinding {
  mid: string;
  nickname: string | null;
  avatarUrl: string | null;
}

export function getBiliBinding(userId: number): BiliBinding | null {
  const row = db
    .select({
      mid: biliAccounts.mid,
      nickname: biliAccounts.nickname,
      avatarUrl: biliAccounts.avatarUrl,
    })
    .from(biliAccounts)
    .where(eq(biliAccounts.userId, userId))
    .get();
  return row ?? null;
}

/** server-only：取凭据用于代理请求 */
export function getBiliSessdata(userId: number): string | null {
  const row = db
    .select({ sessdata: biliAccounts.sessdata })
    .from(biliAccounts)
    .where(eq(biliAccounts.userId, userId))
    .get();
  return row?.sessdata ?? null;
}

export function saveBiliBinding(
  userId: number,
  data: {
    mid: string;
    nickname?: string | null;
    avatarUrl?: string | null;
    sessdata: string;
    biliJct?: string | null;
    refreshToken?: string | null;
  },
) {
  const now = Date.now();
  db.insert(biliAccounts)
    .values({
      userId,
      mid: data.mid,
      nickname: data.nickname ?? null,
      avatarUrl: data.avatarUrl ?? null,
      sessdata: data.sessdata,
      biliJct: data.biliJct ?? null,
      refreshToken: data.refreshToken ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: biliAccounts.userId,
      set: {
        mid: data.mid,
        nickname: data.nickname ?? null,
        avatarUrl: data.avatarUrl ?? null,
        sessdata: data.sessdata,
        biliJct: data.biliJct ?? null,
        refreshToken: data.refreshToken ?? null,
        updatedAt: now,
      },
    })
    .run();
}

export function clearBiliBinding(userId: number) {
  db.delete(biliAccounts).where(eq(biliAccounts.userId, userId)).run();
}
