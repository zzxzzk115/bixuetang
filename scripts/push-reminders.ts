// 回访召回:给订阅了学习提醒、且有复习卡到期的用户推送。
// 建议挂系统定时任务每天固定时段跑一次。需要 .env.local 里的 VAPID_* 密钥。
//   pnpm push:reminders
//
// 自带 DB 连接 + 直接用 web-push(不走 src/lib/db/client,那条链带 "server-only"
// 在裸 node/tsx 下会抛错)。
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq, lte, sql } from "drizzle-orm";
import webpush from "web-push";
import * as schema from "../src/lib/db/schema";
import { dayKey } from "../src/lib/game/day";

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

async function main() {
  loadEnv();
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    console.log("未配置 VAPID 密钥(VAPID_PUBLIC_KEY/PRIVATE_KEY),跳过推送。");
    return;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@bixuetang.com",
    pub,
    priv,
  );

  const dbPath =
    process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "dev.db");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite, { schema });
  const { pushSubscriptions, reviewCards } = schema;
  const today = dayKey();

  const userIds = [
    ...new Set(
      db
        .select({ userId: pushSubscriptions.userId })
        .from(pushSubscriptions)
        .all()
        .map((r) => r.userId),
    ),
  ];

  let notified = 0;
  let devices = 0;
  for (const userId of userIds) {
    const due = Number(
      db
        .select({ n: sql<number>`count(*)` })
        .from(reviewCards)
        .where(
          and(eq(reviewCards.userId, userId), lte(reviewCards.dueDay, today)),
        )
        .get()?.n ?? 0,
    );
    if (due <= 0) continue;
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
          JSON.stringify({
            title: "该复习啦 · 必学堂",
            body: `你有 ${due} 张复习卡到期,清一清别让记忆掉线~`,
            url: "/review",
            tag: "review-due",
          }),
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
    if (sent > 0) {
      notified++;
      devices += sent;
    }
  }

  sqlite.close();
  console.log(
    `复习提醒:${userIds.length} 个订阅用户,已推送 ${notified} 人 / ${devices} 台设备(到期日 ≤ ${today})。`,
  );
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
