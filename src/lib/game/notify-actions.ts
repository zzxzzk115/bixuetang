"use server";

import { eq } from "drizzle-orm";
import webpush from "web-push";
import { getCurrentUser } from "../auth/session";
import { db } from "../db/client";
import { pushSubscriptions, userState } from "../db/schema";

// 通知偏好与自检:断学邮件提醒开关 + 「发送测试通知」(当场验证推送是否真的能到)。

export async function setEmailRecall(
  on: boolean,
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const now = Date.now();
  db.insert(userState)
    .values({ userId: user.id, emailRecall: on ? 1 : 0, updatedAt: now })
    .onConflictDoUpdate({
      target: userState.userId,
      set: { emailRecall: on ? 1 : 0, updatedAt: now },
    })
    .run();
  return { ok: true };
}

export interface TestPushResult {
  ok: boolean;
  sent?: number;
  /** 失败原因:no-vapid=服务端没配密钥 / no-sub=本设备还没订阅 / send-failed */
  reason?: "no-vapid" | "no-sub" | "send-failed";
}

/** 给当前用户所有已订阅设备发一条测试推送——当场判断推送通道是否打通。 */
export async function sendTestPush(): Promise<TestPushResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "send-failed" };

  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return { ok: false, reason: "no-vapid" };

  const subs = db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, user.id))
    .all();
  if (subs.length === 0) return { ok: false, reason: "no-sub" };

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@bixuetang.com",
    pub,
    priv,
  );
  const payload = JSON.stringify({
    title: "测试通知 · 必学堂",
    body: "能看到这条,说明学习提醒推送已打通 🎉",
    url: "/play",
    tag: "test",
  });

  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      );
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) {
        db.delete(pushSubscriptions)
          .where(eq(pushSubscriptions.endpoint, s.endpoint))
          .run();
      }
    }
  }
  return sent > 0
    ? { ok: true, sent }
    : { ok: false, reason: "send-failed" };
}
