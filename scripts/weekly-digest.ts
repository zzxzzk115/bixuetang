// 学习周报:每周给开了「学习周报」且本周确实学过的用户,发一封本周小结邮件。
// 建议挂 cron 每周固定一次(如周日晚)。同人 6 天内至多一封。
//   pnpm weekly:digest
//
// 自带 DB + nodemailer(不走带 "server-only" 的 src/lib 封装,裸 node/tsx 会抛错)。
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq, gte, sql } from "drizzle-orm";
import nodemailer, { type Transporter } from "nodemailer";
import * as schema from "../src/lib/db/schema";
import { dayKey, diffDays } from "../src/lib/game/day";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** 同人两封周报至少间隔多少天 */
const COOLDOWN_DAYS = 6;

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
  const mailer = mailTransport();
  const mailFrom = process.env.SMTP_FROM ?? "必学堂 <no-reply@bixuetang.com>";

  const dbPath =
    process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "dev.db");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite, { schema });
  const { userState, users, xpEvents, episodeProgress, courseProgress, streakState } =
    schema;

  const today = dayKey();
  const since = Date.now() - WEEK_MS;

  const targets = db
    .select({
      userId: userState.userId,
      weeklySentDay: userState.weeklySentDay,
      email: users.email,
      name: users.displayName,
      username: users.username,
    })
    .from(userState)
    .innerJoin(users, eq(users.id, userState.userId))
    .where(and(eq(userState.emailWeekly, 1), eq(users.emailVerified, true)))
    .all();

  const num = (v: number | null | undefined) => Number(v ?? 0);
  let sent = 0;

  for (const t of targets) {
    if (!t.email) continue;
    if (
      t.weeklySentDay &&
      diffDays(t.weeklySentDay, today) < COOLDOWN_DAYS
    ) {
      continue;
    }

    const weekXp = num(
      db
        .select({ n: sql<number>`coalesce(sum(${xpEvents.amount}),0)` })
        .from(xpEvents)
        .where(and(eq(xpEvents.userId, t.userId), gte(xpEvents.createdAt, since)))
        .get()?.n,
    );
    const weekEpisodes = num(
      db
        .select({ n: sql<number>`count(*)` })
        .from(episodeProgress)
        .where(
          and(
            eq(episodeProgress.userId, t.userId),
            gte(episodeProgress.watchedAt, since),
          ),
        )
        .get()?.n,
    );
    // 本周没学过就不发(交给断学召回),周报只给活跃用户正向反馈
    if (weekXp <= 0 && weekEpisodes <= 0) continue;

    const weekCourses = num(
      db
        .select({ n: sql<number>`count(*)` })
        .from(courseProgress)
        .where(
          and(
            eq(courseProgress.userId, t.userId),
            eq(courseProgress.status, "done"),
            gte(courseProgress.updatedAt, since),
          ),
        )
        .get()?.n,
    );
    const streak = num(
      db
        .select({ current: streakState.current })
        .from(streakState)
        .where(eq(streakState.userId, t.userId))
        .get()?.current,
    );

    const name = t.name || t.username || "同学";
    const lines = [
      `学习经验 +${weekXp}`,
      `看完 ${weekEpisodes} 集`,
      `当前连胜 ${streak} 天`,
    ];
    if (weekCourses > 0) lines.push(`学完 ${weekCourses} 门课`);
    const text =
      `${name}，这是你过去一周的学习小结：\n\n` +
      lines.map((l) => `· ${l}`).join("\n") +
      `\n\n这一周辛苦啦，下周我们接着来。\n` +
      `回去看看：${origin}/me\n\n` +
      `不想再收到周报？到「设置」关掉「学习周报」就好。\n必学堂`;

    if (mailer) {
      await mailer.sendMail({
        from: mailFrom,
        to: t.email,
        subject: "你的本周学习小结 · 必学堂",
        text,
      });
    } else {
      console.info(
        `[mail:dev] 未配置 SMTP,周报未外发\n  收件:${t.email}\n  正文:${text}`,
      );
    }
    db.update(userState)
      .set({ weeklySentDay: today, updatedAt: Date.now() })
      .where(eq(userState.userId, t.userId))
      .run();
    sent++;
  }

  sqlite.close();
  console.log(`学习周报(${today}):候选 ${targets.length} 人,已发 ${sent} 封。`);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
