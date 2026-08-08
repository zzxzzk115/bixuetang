"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "../db/client";
import { users } from "../db/schema";
import { passwordStrength, verifyCaptcha } from "./captcha";
import { isValidEmail, normalizeEmail } from "./email";
import { hashPassword, verifyPassword } from "./password";
import { createSession, destroySession } from "./session";
import { takeReferrer } from "../referral";

export type AuthFormState = { error: string } | null;

const USERNAME_RE = /^[a-z0-9_]{3,32}$/;

export async function register(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const password2 = String(formData.get("password2") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "");
  const captchaToken = String(formData.get("captchaToken") ?? "");
  const captchaAnswer = String(formData.get("captchaAnswer") ?? "");

  if (!USERNAME_RE.test(username)) {
    return { error: "用户名需为 3–32 位小写字母、数字或下划线" };
  }
  // 邮箱可留空;填了就得合法,且不能与他人重复(用于找回)
  const email = emailRaw.trim() ? normalizeEmail(emailRaw) : null;
  if (email && !isValidEmail(email)) {
    return { error: "邮箱格式不正确(可留空,之后在设置里补绑)" };
  }
  if (password.length < 8) {
    return { error: "密码至少 8 位" };
  }
  if (passwordStrength(password) < 1) {
    return { error: "密码太弱:至少混用字母与数字(建议再加大小写或符号)" };
  }
  if (password !== password2) {
    return { error: "两次输入的密码不一致" };
  }
  if (!verifyCaptcha(captchaToken, captchaAnswer)) {
    return { error: "验证码不对或已过期,换一张再试" };
  }

  const existing = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .get();
  if (existing) {
    return { error: "该用户名已被占用" };
  }
  if (email) {
    const emailTaken = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .get();
    if (emailTaken) return { error: "该邮箱已被注册" };
  }

  const passwordHash = await hashPassword(password);
  const inserted = db
    .insert(users)
    .values({
      username,
      passwordHash,
      displayName: displayName || null,
      email,
      createdAt: Date.now(),
    })
    .returning({ id: users.id })
    .get();

  // 拉新归因:经谁的分享链接来的(排除自荐)
  const ref = await takeReferrer();
  if (ref && ref !== inserted.id) {
    db.update(users)
      .set({ referredBy: ref })
      .where(eq(users.id, inserted.id))
      .run();
  }

  await createSession(inserted.id);
  redirect("/play");
}

export async function login(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const identifier = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  // 登录凭据用户名或邮箱都行:带 @ 按邮箱查(规范化小写),否则按用户名
  const user = identifier.includes("@")
    ? db
        .select()
        .from(users)
        .where(eq(users.email, normalizeEmail(identifier)))
        .get()
    : db.select().from(users).where(eq(users.username, identifier)).get();
  // 用户不存在时也走一次哈希校验，避免用响应时间探测用户名
  const ok = user
    ? await verifyPassword(user.passwordHash, password)
    : await verifyPassword(
        "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        password,
      ).then(() => false);

  if (!user || !ok) {
    return { error: "用户名/邮箱或密码不正确" };
  }

  await createSession(user.id);
  redirect("/play");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/");
}
