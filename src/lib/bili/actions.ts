"use server";

import { getCurrentUser } from "../auth/session";
import { fetchSelfInfo, qrGenerate, qrPoll } from "./api";
import {
  clearBiliBinding,
  getBiliBinding,
  saveBiliBinding,
  type BiliBinding,
} from "./account";

// B 站扫码登录绑定。二维码由 B 站签发，我们只做中转与凭据落库。

export interface QrStartResult {
  ok: boolean;
  error?: string;
  /** 需要编码成二维码的 URL（前端自己画码，不依赖第三方图床） */
  url?: string;
  key?: string;
}

export async function startBiliLogin(): Promise<QrStartResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录学者公会账号" };
  try {
    const data = await qrGenerate();
    return { ok: true, url: data.url, key: data.qrcode_key };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "二维码申请失败",
    };
  }
}

export interface QrPollActionResult {
  ok: boolean;
  error?: string;
  status?: "pending" | "scanned" | "expired" | "ok";
  binding?: BiliBinding;
}

export async function pollBiliLogin(
  key: string,
): Promise<QrPollActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录学者公会账号" };
  try {
    const result = await qrPoll(key);
    if (result.status !== "ok") return { ok: true, status: result.status };

    // 拿到凭据后取昵称头像，绑定入库
    let nickname: string | null = null;
    let avatarUrl: string | null = null;
    try {
      const info = await fetchSelfInfo(result.sessdata!);
      nickname = info.uname;
      avatarUrl = info.face;
    } catch {
      // 昵称取不到不影响绑定
    }
    saveBiliBinding(user.id, {
      mid: result.mid!,
      nickname,
      avatarUrl,
      sessdata: result.sessdata!,
      biliJct: result.biliJct ?? null,
      refreshToken: result.refreshToken ?? null,
    });
    return {
      ok: true,
      status: "ok",
      binding: { mid: result.mid!, nickname, avatarUrl },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "登录轮询失败",
    };
  }
}

export async function unbindBili(): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };
  clearBiliBinding(user.id);
  return { ok: true };
}

export async function currentBiliBinding(): Promise<BiliBinding | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return getBiliBinding(user.id);
}
