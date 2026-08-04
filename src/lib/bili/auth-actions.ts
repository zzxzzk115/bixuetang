"use server";

import { eq, lt } from "drizzle-orm";
import { db } from "../db/client";
import { biliAccounts, pendingBiliSignups, users } from "../db/schema";
import { hashPassword } from "../auth/password";
import { createSession } from "../auth/session";
import { fetchSelfInfo, qrGenerate, qrPoll } from "./api";
import { saveBiliBinding } from "./account";

// 用 bilibili 扫码直接登录 / 注册必学堂账号。
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
  /** signup = 扫码通过了，但这个 bilibili 账号还没有本站账号，要先开号 */
  status?: "pending" | "scanned" | "expired" | "ok" | "signup";
  /** ok 时：这次是新建账号还是登录既有账号 */
  created?: boolean;
  note?: string;
  /** status=signup 时：换取开号的一次性凭证 */
  signupToken?: string;
  /** status=signup 时：拿来做用户名与昵称的默认值 */
  suggestedUsername?: string;
  biliNickname?: string | null;
}

/** 由 bilibili uid 派生一个合法用户名（3–32 位小写字母/数字/下划线） */
function usernameForMid(mid: string): string {
  return `bili_${mid}`.slice(0, 32).toLowerCase();
}

/** 待开号凭据的有效期：扫完码填个表，10 分钟绰绰有余 */
const SIGNUP_TTL = 10 * 60 * 1000;

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

    // 这个 bilibili 账号已经绑过某个本站账号 → 直接登录它
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

    // 没绑过 → 先别建号。把凭据暂存起来，让用户自己定用户名和密码，
    // 否则这个账号就只能靠扫码进，换台没装 bilibili 的设备就锁死了。
    const now = Date.now();
    const token = crypto.randomUUID();
    db.delete(pendingBiliSignups)
      .where(lt(pendingBiliSignups.expiresAt, now))
      .run();
    db.insert(pendingBiliSignups)
      .values({
        token,
        mid,
        nickname,
        avatarUrl: face,
        sessdata,
        biliJct: result.biliJct ?? null,
        refreshToken: result.refreshToken ?? null,
        expiresAt: now + SIGNUP_TTL,
        createdAt: now,
      })
      .run();

    return {
      ok: true,
      status: "signup",
      signupToken: token,
      suggestedUsername: usernameForMid(mid),
      biliNickname: nickname,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "登录失败",
    };
  }
}

export interface BiliSignupResult {
  ok: boolean;
  error?: string;
}

const USERNAME_RE = /^[a-z0-9_]{3,32}$/;

/**
 * 用扫码时暂存的凭据开号：建账号 → 绑定 bilibili → 登录。
 * 用户名和密码由用户自己定，这样以后不靠 bilibili 也能登录。
 */
export async function completeBiliSignup(
  token: string,
  username: string,
  password: string,
  displayName: string,
): Promise<BiliSignupResult> {
  const name = username.trim().toLowerCase();
  if (!USERNAME_RE.test(name)) {
    return { ok: false, error: "用户名需为 3–32 位小写字母、数字或下划线" };
  }
  if (password.length < 8) {
    return { ok: false, error: "密码至少 8 位" };
  }

  const pending = db
    .select()
    .from(pendingBiliSignups)
    .where(eq(pendingBiliSignups.token, token))
    .get();
  if (!pending || pending.expiresAt < Date.now()) {
    return { ok: false, error: "登录凭证已过期，请重新扫码" };
  }

  // 扫完码到填完表这段时间里，同一个 bilibili 账号可能已在别处开好号了
  const bound = db
    .select({ userId: biliAccounts.userId })
    .from(biliAccounts)
    .where(eq(biliAccounts.mid, pending.mid))
    .get();
  if (bound) {
    db.delete(pendingBiliSignups)
      .where(eq(pendingBiliSignups.token, token))
      .run();
    await createSession(bound.userId);
    return { ok: true };
  }

  const taken = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, name))
    .get();
  if (taken) return { ok: false, error: "该用户名已被占用" };

  const inserted = db
    .insert(users)
    .values({
      username: name,
      passwordHash: await hashPassword(password),
      displayName: displayName.trim() || pending.nickname,
      avatar: pending.avatarUrl ? `bili:${pending.avatarUrl}` : null,
      createdAt: Date.now(),
    })
    .returning({ id: users.id })
    .get();

  saveBiliBinding(inserted.id, {
    mid: pending.mid,
    nickname: pending.nickname,
    avatarUrl: pending.avatarUrl,
    sessdata: pending.sessdata,
    biliJct: pending.biliJct,
    refreshToken: pending.refreshToken,
  });
  db.delete(pendingBiliSignups)
    .where(eq(pendingBiliSignups.token, token))
    .run();
  await createSession(inserted.id);
  return { ok: true };
}
