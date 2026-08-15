// 回访召回:每天固定时段跑一次(挂 cron / systemd timer,容器不自带调度)。
//   pnpm push:reminders
// 两类提醒,每人每天至多发一条(召回优先于复习提醒):
//   1) 断学召回——太久没学习(≥INACTIVE_DAYS 天)的用户,推送 + 邮件(需已验证邮箱
//      且在设置里开了「断学邮件提醒」);同一人 RECALL_COOLDOWN_DAYS 天内只召回一次。
//   2) 复习提醒——有到期复习卡的用户,推送。
//
// 自带 DB 连接 + 直接用 web-push / nodemailer(不走 src/lib 里带 "server-only"
// 的封装,那在裸 node/tsx 下会抛错)。VAPID_* 缺失只关推送,邮件照发;反之亦然。
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq, lte, sql } from "drizzle-orm";
import webpush from "web-push";
import nodemailer, { type Transporter } from "nodemailer";
import * as schema from "../src/lib/db/schema";
import { dayKey, diffDays } from "../src/lib/game/day";

/** 多少天没学习算「断学」,触发召回 */
const INACTIVE_DAYS = 3;
/** 同一人两次召回至少间隔多少天(避免天天打扰) */
const RECALL_COOLDOWN_DAYS = 7;

function loadEnv() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

function mailTransport(): Transporter | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "1" || port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });
}

async function main() {
  loadEnv();
  const origin = (process.env.APP_ORIGIN || "https://bixuetang.com").replace(
    /\/+$/,
    "",
  );

  // 推送(VAPID)——缺密钥只关推送
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const pushOn = Boolean(pub && priv);
  if (pushOn) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:admin@bixuetang.com",
      pub!,
      priv!,
    );
  } else {
    console.log("未配置 VAPID(VAPID_PUBLIC_KEY/PRIVATE_KEY),本次不发推送。");
  }

  // 邮件(SMTP)——缺配置则把邮件打日志(无头可测),不外发
  const mailer = mailTransport();
  const mailFrom =
    process.env.SMTP_FROM ?? "必学堂 <no-reply@bixuetang.com>";

  const dbPath =
    process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "dev.db");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite, { schema });
  const {
    pushSubscriptions,
    reviewCards,
    streakState,
    userState,
    users,
  } = schema;
  const today = dayKey();

  // 候选人:有推送订阅的 ∪ 开了断学邮件提醒且邮箱已验证的
  const subUserIds = db
    .select({ userId: pushSubscriptions.userId })
    .from(pushSubscriptions)
    .all()
    .map((r) => r.userId);
  const emailRecallUserIds = db
    .select({ userId: userState.userId })
    .from(userState)
    .innerJoin(users, eq(users.id, userState.userId))
    .where(and(eq(userState.emailRecall, 1), eq(users.emailVerified, true)))
    .all()
    .map((r) => r.userId);
  const userIds = [...new Set([...subUserIds, ...emailRecallUserIds])];

  const pushTo = async (
    userId: number,
    payload: Record<string, unknown>,
  ): Promise<number> => {
    if (!pushOn) return 0;
    const subs = db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))
      .all();
    let sent = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
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
    return sent;
  };

  const emailTo = async (to: string, subject: string, text: string) => {
    if (!mailer) {
      console.info(`[mail:dev] 未配置 SMTP,邮件未外发\n  收件:${to}\n  主题:${subject}`);
      return;
    }
    await mailer.sendMail({ from: mailFrom, to, subject, text });
  };

  let recalls = 0;
  let reviews = 0;
  let recallEmails = 0;

  for (const userId of userIds) {
    const streak = db
      .select({ lastDay: streakState.lastDay })
      .from(streakState)
      .where(eq(streakState.userId, userId))
      .get();
    const st = db
      .select({
        emailRecall: userState.emailRecall,
        recallSentDay: userState.recallSentDay,
      })
      .from(userState)
      .where(eq(userState.userId, userId))
      .get();
    const acct = db
      .select({
        email: users.email,
        emailVerified: users.emailVerified,
        name: users.displayName,
        username: users.username,
      })
      .from(users)
      .where(eq(users.id, userId))
      .get();

    // 学过才召回(从没学过的新用户交给上手引导,不在这里打扰)
    const lastDay = streak?.lastDay ?? "";
    const inactiveDays = lastDay ? diffDays(lastDay, today) : -1;
    const recallReady =
      inactiveDays >= INACTIVE_DAYS &&
      (!st?.recallSentDay ||
        diffDays(st.recallSentDay, today) >= RECALL_COOLDOWN_DAYS);

    if (recallReady) {
      const name = acct?.name || acct?.username || "同学";
      const sent = await pushTo(userId, {
        title: "好久不见 · 必学堂",
        body: `${inactiveDays} 天没来啦,回来看一集、清几张卡,别让学过的掉线~`,
        url: "/play",
        tag: "recall",
      });
      let mailed = false;
      if (st?.emailRecall === 1 && acct?.emailVerified && acct.email) {
        await emailTo(
          acct.email,
          "好久不见 · 回必学堂继续学吧",
          `${name},你已经 ${inactiveDays} 天没学习了。\n\n` +
            `学过的东西会慢慢忘,花几分钟回来看一集、清几张复习卡,把记忆接回来。\n` +
            `继续学习:${origin}/play\n\n` +
            `不想再收到这类邮件?到「设置」关掉「断学邮件提醒」即可。\n必学堂`,
        );
        mailed = true;
        recallEmails++;
      }
      if (sent > 0 || mailed) {
        recalls++;
        db.update(userState)
          .set({ recallSentDay: today, updatedAt: Date.now() })
          .where(eq(userState.userId, userId))
          .run();
      }
      continue; // 召回过了就不再发复习提醒,免得一天两条
    }

    // 没到召回门槛:有到期复习卡则发复习提醒(推送)
    const due = Number(
      db
        .select({ n: sql<number>`count(*)` })
        .from(reviewCards)
        .where(
          and(eq(reviewCards.userId, userId), lte(reviewCards.dueDay, today)),
        )
        .get()?.n ?? 0,
    );
    if (due > 0) {
      const sent = await pushTo(userId, {
        title: "该复习啦 · 必学堂",
        body: `你有 ${due} 张复习卡到期,清一清别让记忆掉线~`,
        url: "/review",
        tag: "review-due",
      });
      if (sent > 0) reviews++;
    }
  }

  sqlite.close();
  console.log(
    `提醒完成(${today}):候选 ${userIds.length} 人 · 断学召回 ${recalls} 人(其中邮件 ${recallEmails} 封)· 复习提醒 ${reviews} 人。` +
      (pushOn ? "" : " [推送关闭:未配 VAPID]"),
  );
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
