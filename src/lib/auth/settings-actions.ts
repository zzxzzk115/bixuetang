"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "../db/client";
import { users } from "../db/schema";
import { containsSensitive } from "../moderation/filter";
import { sendEmailVerification } from "./email-verify";
import { isValidEmail, normalizeEmail } from "./email";
import { hashPassword, verifyPassword } from "./password";
import { getCurrentUser } from "./session";

export type SettingsFormState = { error?: string; success?: string } | null;

export async function updateEmail(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "请先登录" };

  const raw = String(formData.get("email") ?? "");
  // 留空 = 解绑找回邮箱
  if (!raw.trim()) {
    db.update(users)
      .set({ email: null, emailVerified: false })
      .where(eq(users.id, user.id))
      .run();
    revalidatePath("/settings"); // 让「未验证」徽标/按钮即时刷新,不用手动重载
    return { success: "已解除邮箱绑定" };
  }

  const email = normalizeEmail(raw);
  if (!isValidEmail(email)) return { error: "请输入有效的邮箱地址" };

  // 没变且已验证:不折腾,也不重复发信
  if (email === user.email && user.emailVerified) {
    return { success: "该邮箱已验证,无需重复绑定" };
  }

  // 邮箱要能唯一定位账号,不能与他人重复
  const taken = db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), ne(users.id, user.id)))
    .get();
  if (taken) return { error: "该邮箱已被其他账号绑定" };

  // 先落库为「未验证」,再发确认链接——验证过才准用于找回密码
  db.update(users)
    .set({ email, emailVerified: false })
    .where(eq(users.id, user.id))
    .run();
  revalidatePath("/settings"); // 绑定后即时显示「未验证」徽标 + 重发按钮
  try {
    await sendEmailVerification(user.id, email);
  } catch (err) {
    console.error("[email-verify] 发送验证邮件失败(请检查 SMTP_* 配置):", err);
    return {
      error: "邮箱已保存,但验证邮件发送失败;稍后点「重新发送验证邮件」再试。",
    };
  }
  return { success: `验证邮件已发送到 ${email},点击信里的链接完成绑定(24 小时内有效)。` };
}

// 没收到/过期了:重发验证邮件
export async function resendEmailVerification(): Promise<SettingsFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "请先登录" };
  if (!user.email) return { error: "还没绑定邮箱" };
  if (user.emailVerified) return { success: "邮箱已验证,无需重复" };
  try {
    await sendEmailVerification(user.id, user.email);
  } catch (err) {
    console.error("[email-verify] 重发验证邮件失败(请检查 SMTP_* 配置):", err);
    return { error: "验证邮件发送失败,请稍后再试" };
  }
  return { success: `验证邮件已重新发送到 ${user.email},请查收(含垃圾箱)。` };
}

export async function updateProfile(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "请先登录" };

  const displayName = String(formData.get("displayName") ?? "").trim();
  if (displayName.length > 32) return { error: "角色名最长 32 个字符" };
  if (displayName && containsSensitive(displayName)) {
    return { error: "角色名含有不当词汇,换一个吧" };
  }

  db.update(users)
    .set({ displayName: displayName || null })
    .where(eq(users.id, user.id))
    .run();

  revalidatePath("/", "layout");
  return { success: "角色名已更新" };
}

export async function changePassword(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "请先登录" };

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  if (next.length < 8) return { error: "新密码至少 8 位" };

  const ok = await verifyPassword(user.passwordHash, current);
  if (!ok) return { error: "当前密码不正确" };

  db.update(users)
    .set({ passwordHash: await hashPassword(next) })
    .where(eq(users.id, user.id))
    .run();

  return { success: "密码已修改" };
}
