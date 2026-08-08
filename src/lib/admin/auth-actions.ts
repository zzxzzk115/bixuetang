"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "../db/client";
import { adminUsers } from "../db/schema";
import { passwordStrength } from "../auth/captcha";
import {
  dummyPasswordHash,
  hashPassword,
  verifyPassword,
} from "../auth/password";
import {
  createAdminSession,
  destroyAdminSession,
  getCurrentAdmin,
} from "./session";

export type AdminFormState = { error: string } | { ok: true } | null;

export async function adminLogin(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const admin = db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.username, username))
    .get();
  // 用户不存在也走一次哈希,避免用响应时间探测账号
  const ok = admin
    ? await verifyPassword(admin.passwordHash, password)
    : await verifyPassword(await dummyPasswordHash(), password).then(
        () => false,
      );

  if (!admin || !ok) return { error: "用户名或密码不正确" };

  await createAdminSession(admin.id);
  // 用默认弱口令登录的,强制去改密码
  redirect(admin.mustChangePassword ? "/console/settings" : "/console");
}

export async function adminLogout(): Promise<void> {
  await destroyAdminSession();
  redirect("/console/login");
}

export async function adminChangePassword(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "登录已失效,请重新登录" };

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const next2 = String(formData.get("next2") ?? "");

  if (!(await verifyPassword(admin.passwordHash, current))) {
    return { error: "当前密码不正确" };
  }
  if (next.length < 8) return { error: "新密码至少 8 位" };
  if (passwordStrength(next) < 1) {
    return { error: "新密码太弱:至少混用字母与数字" };
  }
  if (next !== next2) return { error: "两次输入的新密码不一致" };
  if (next === current) return { error: "新密码不能与当前密码相同" };

  const passwordHash = await hashPassword(next);
  db.update(adminUsers)
    .set({ passwordHash, mustChangePassword: false })
    .where(eq(adminUsers.id, admin.id))
    .run();
  return { ok: true };
}
