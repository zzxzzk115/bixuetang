"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "../db/client";
import { users } from "../db/schema";
import { containsSensitive } from "../moderation/filter";
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
    db.update(users).set({ email: null }).where(eq(users.id, user.id)).run();
    return { success: "已解除邮箱绑定" };
  }

  const email = normalizeEmail(raw);
  if (!isValidEmail(email)) return { error: "请输入有效的邮箱地址" };

  // 邮箱要能唯一定位账号,不能与他人重复
  const taken = db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), ne(users.id, user.id)))
    .get();
  if (taken) return { error: "该邮箱已被其他账号绑定" };

  db.update(users).set({ email }).where(eq(users.id, user.id)).run();
  return { success: "邮箱已绑定,之后可用它找回密码" };
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
