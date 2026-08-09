"use server";

import { confirmEmailVerification } from "./email-verify";

export type VerifyState = { ok?: boolean; error?: string } | null;

// 凭邮件链接里的 token 确认邮箱。用按钮 POST 触发(而非页面 GET 即验),
// 避开邮件客户端预取链接把 token 提前消耗掉。
export async function verifyEmail(
  _prev: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  const token = String(formData.get("token") ?? "");
  const r = confirmEmailVerification(token);
  return r.ok ? { ok: true } : { error: r.error };
}
