"use server";

import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../db/client";
import { passwordResets, sessions, users } from "../db/schema";
import { sendMail } from "../mail";
import { passwordStrength } from "./captcha";
import { isValidEmail, normalizeEmail } from "./email";
import { hashPassword } from "./password";

// 忘记密码 → 发重置链接 → 凭链接改密。
// 链接里是原始 token,DB 只存 SHA-256(与 session 一致,泄库不泄 token)。
// 存在性不外泄:无论邮箱是否注册,申请一律回成功,防拿来枚举用户。

const TTL_MS = 60 * 60 * 1000; // 1 小时

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

// 重置链接的站点源:优先 APP_ORIGIN,否则据请求头(反代会带 x-forwarded-*)推断
async function siteOrigin(): Promise<string> {
  if (process.env.APP_ORIGIN) return process.env.APP_ORIGIN.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export type ResetRequestState = { done?: boolean; error?: string } | null;

export async function requestPasswordReset(
  _prev: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  if (!isValidEmail(email)) return { error: "请输入有效的邮箱地址" };

  const user = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .get();

  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    db.insert(passwordResets)
      .values({
        tokenHash: sha256(token),
        userId: user.id,
        expiresAt: now + TTL_MS,
        createdAt: now,
      })
      .run();
    const link = `${await siteOrigin()}/reset-password?token=${token}`;
    // 发信失败(SMTP 配错/网络)不能把整个动作抛崩:一崩前端就 500、还会用
    // 「注册邮箱报错、未注册邮箱正常」的差异泄露账号是否存在。吞掉并记日志,
    // 让运营据日志修 SMTP;对用户一律回同样的成功文案。
    try {
      await sendMail({
        to: email,
        subject: "必学堂 · 重置密码",
        text:
          `你(或有人)申请重置必学堂账号的密码。\n` +
          `点击下面的链接,在 1 小时内设置新密码:\n\n${link}\n\n` +
          `若不是你本人操作,忽略此邮件即可,密码不会变动。`,
      });
    } catch (err) {
      console.error("[reset] 发送重置邮件失败(请检查 SMTP_* 配置):", err);
    }
  }

  // 不论邮箱是否注册,一律回成功,避免被拿来枚举已注册邮箱
  return { done: true };
}

export type ResetState = { error?: string } | null;

export async function resetPassword(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const token = String(formData.get("token") ?? "");
  const next = String(formData.get("password") ?? "");
  const next2 = String(formData.get("password2") ?? "");
  if (next.length < 8) return { error: "新密码至少 8 位" };
  if (passwordStrength(next) < 1)
    return { error: "密码太弱:至少混用字母与数字" };
  if (next !== next2) return { error: "两次输入的密码不一致" };

  const now = Date.now();
  const row = db
    .select()
    .from(passwordResets)
    .where(eq(passwordResets.tokenHash, sha256(token)))
    .get();
  if (!row || row.usedAt != null || row.expiresAt < now) {
    return { error: "链接无效或已过期,请重新申请重置" };
  }

  db.update(users)
    .set({ passwordHash: await hashPassword(next) })
    .where(eq(users.id, row.userId))
    .run();
  db.update(passwordResets)
    .set({ usedAt: now })
    .where(eq(passwordResets.tokenHash, row.tokenHash))
    .run();
  // 改密后踢掉该账号所有会话:若是被盗号找回,原登录态一并失效
  db.delete(sessions).where(eq(sessions.userId, row.userId)).run();

  redirect("/login?pwd=1&reset=1");
}
