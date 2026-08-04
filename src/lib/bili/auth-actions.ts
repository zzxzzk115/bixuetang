"use server";

import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { biliAccounts, users } from "../db/schema";
import { hashPassword } from "../auth/password";
import { createSession } from "../auth/session";
import { fetchSelfInfo, qrGenerate, qrPoll } from "./api";
import { saveBiliBinding } from "./account";

// 用 bilibili 扫码直接登录 / 注册学者公会账号。
// 已绑定过的 bilibili 账号 → 登录既有账号；没绑过 → 建号并绑定，昵称取 bilibili 昵称（可改）。

export interface BiliAuthStart {
  ok: boolean;
  error?: string;
  url?: string;
  key?: string;
  buvid?: string;
}

function newBuvid(): string {
  const hex = (n: number) =>
    Array.from({ length: n }, () =>
      Math.floor(Math.random() * 16).toString(16).toUpperCase(),
    ).join("");
  return `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}${Math.floor(
    Math.random() * 90000 + 10000,
  )}infoc`;
}

export async function startBiliAuth(): Promise<BiliAuthStart> {
  try {
    const buvid = newBuvid();
    const data = await qrGenerate(buvid);
    return { ok: true, url: data.url, key: data.qrcode_key, buvid };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "二维码申请失败",
    };
  }
}

export interface BiliAuthPoll {
  ok: boolean;
  error?: string;
  status?: "pending" | "scanned" | "expired" | "ok";
  /** ok 时：这次是新建账号还是登录既有账号 */
  created?: boolean;
  note?: string;
}

/** 由 bilibili uid 派生一个合法用户名（3–32 位小写字母/数字/下划线） */
function usernameForMid(mid: string): string {
  return `bili_${mid}`.slice(0, 32).toLowerCase();
}

export async function pollBiliAuth(
  key: string,
  buvid?: string,
): Promise<BiliAuthPoll> {
  try {
    const result = await qrPoll(key, buvid);
    if (result.status !== "ok") {
      return {
        ok: true,
        status: result.status,
        note:
          result.rawCode !== undefined
            ? `bilibili 返回 code=${result.rawCode}${result.rawMessage ? ` ${result.rawMessage}` : ""}`
            : undefined,
      };
    }

    const mid = result.mid!;
    const sessdata = result.sessdata!;

    let nickname: string | null = null;
    let face: string | null = null;
    try {
      const info = await fetchSelfInfo(sessdata);
      nickname = info.uname;
      face = info.face;
    } catch {
      // 拿不到昵称不影响登录
    }

    // 这个 bilibili 账号已经绑过某个公会账号 → 直接登录它
    const bound = db
      .select({ userId: biliAccounts.userId })
      .from(biliAccounts)
      .where(eq(biliAccounts.mid, mid))
      .get();

    if (bound) {
      saveBiliBinding(bound.userId, {
        mid,
        nickname,
        avatarUrl: face,
        sessdata,
        biliJct: result.biliJct ?? null,
        refreshToken: result.refreshToken ?? null,
      });
      await createSession(bound.userId);
      return { ok: true, status: "ok", created: false };
    }

    // 没绑过 → 新建账号。密码随机（用户之后可在设置里改），登录靠扫码
    const username = usernameForMid(mid);
    const existing = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .get();

    let userId: number;
    if (existing) {
      userId = existing.id;
    } else {
      const randomPassword = `${crypto.randomUUID()}${crypto.randomUUID()}`;
      const inserted = db
        .insert(users)
        .values({
          username,
          passwordHash: await hashPassword(randomPassword),
          displayName: nickname,
          avatar: face ? `bili:${face}` : null,
          createdAt: Date.now(),
        })
        .returning({ id: users.id })
        .get();
      userId = inserted.id;
    }

    saveBiliBinding(userId, {
      mid,
      nickname,
      avatarUrl: face,
      sessdata,
      biliJct: result.biliJct ?? null,
      refreshToken: result.refreshToken ?? null,
    });
    await createSession(userId);
    return { ok: true, status: "ok", created: !existing };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "登录失败",
    };
  }
}
