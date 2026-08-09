import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { emailVerifications, users } from "../db/schema";
import { sendMail } from "../mail";
import { siteOrigin } from "./origin";

// 邮箱归属验证:绑定/改邮箱 → 发确认链接到该邮箱 → 点了才标 emailVerified。
// 纯 helper 模块(非 "use server"),供 settings-actions / verify-actions 复用。

const TTL_MS = 24 * 60 * 60 * 1000; // 24 小时

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

// 给某用户的某邮箱发一封验证信。发信失败会抛,调用方决定怎么提示。
export async function sendEmailVerification(
  userId: number,
  email: string,
): Promise<void> {
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  db.insert(emailVerifications)
    .values({
      tokenHash: sha256(token),
      userId,
      email,
      expiresAt: now + TTL_MS,
      createdAt: now,
    })
    .run();
  const link = `${await siteOrigin()}/verify-email?token=${token}`;
  await sendMail({
    to: email,
    subject: "必学堂 · 验证邮箱",
    text:
      `你在必学堂绑定了这个邮箱,用于找回密码。\n` +
      `点击下面的链接,在 24 小时内完成验证:\n\n${link}\n\n` +
      `若不是你本人操作,忽略此邮件即可,邮箱不会被启用。`,
  });
}

// 凭 token 确认邮箱。token 必须未用、未过期,且仍是该用户当前绑定的邮箱
// (改了又验旧链接则失败)。better-sqlite3 同步,直接返回结果。
export function confirmEmailVerification(token: string): {
  ok: boolean;
  error?: string;
} {
  if (!token) return { ok: false, error: "链接不完整" };
  const now = Date.now();
  const row = db
    .select()
    .from(emailVerifications)
    .where(eq(emailVerifications.tokenHash, sha256(token)))
    .get();
  if (!row || row.usedAt != null || row.expiresAt < now) {
    return { ok: false, error: "链接无效或已过期,请回设置里重新发送验证邮件" };
  }
  const user = db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, row.userId))
    .get();
  if (!user || user.email !== row.email) {
    return { ok: false, error: "链接与当前绑定的邮箱不匹配,请重新绑定后验证" };
  }
  db.update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, row.userId))
    .run();
  db.update(emailVerifications)
    .set({ usedAt: now })
    .where(eq(emailVerifications.tokenHash, row.tokenHash))
    .run();
  return { ok: true };
}
