"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "../db/client";
import { users } from "../db/schema";
import { hashPassword, verifyPassword } from "./password";
import { getCurrentUser } from "./session";

export type SettingsFormState = { error?: string; success?: string } | null;

export async function updateProfile(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "请先登录" };

  const displayName = String(formData.get("displayName") ?? "").trim();
  if (displayName.length > 32) return { error: "角色名最长 32 个字符" };

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
