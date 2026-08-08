import "server-only";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { adminUsers } from "../db/schema";
import { hashPassword } from "../auth/password";

// 首启播种默认管理员。表空时建 username=admin,密码取 ADMIN_INITIAL_PASSWORD,
// 缺省用弱口令 "admin" 并置 must_change_password —— 首登被强制改。
// 幂等:表非空直接返回,重启不会重复建号或覆盖已改的密码。
let seeded = false;

export async function seedAdmin(): Promise<void> {
  if (seeded) return;
  seeded = true;
  try {
    const row = db
      .select({ n: sql<number>`count(*)` })
      .from(adminUsers)
      .get();
    if ((row?.n ?? 0) > 0) return;

    const initial = process.env.ADMIN_INITIAL_PASSWORD?.trim();
    const password = initial || "admin";
    const passwordHash = await hashPassword(password);
    db.insert(adminUsers)
      .values({
        username: "admin",
        passwordHash,
        // 用了默认弱口令才强制改;显式配了初始密码就不强制
        mustChangePassword: !initial,
        createdAt: Date.now(),
      })
      .run();
    console.log(
      `[admin] 已播种默认管理员 admin${initial ? "(用 ADMIN_INITIAL_PASSWORD)" : "(默认口令 admin,首登须改)"}`,
    );
  } catch (e) {
    seeded = false; // 失败允许下次重试
    console.error("[admin] 播种默认管理员失败", e);
  }
}
