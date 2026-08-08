"use server";

import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getContent } from "../content/load";
import { db } from "../db/client";
import {
  COURSE_STATUSES,
  type CourseStatus,
  adminAudit,
  courseProgress,
  episodeProgress,
  rpgInventory,
  rpgProfiles,
  users,
  xpEvents,
} from "../db/schema";
import { MAX_SHIELD_HEARTS } from "../game/relics";
import { requireAdmin, type AdminUser } from "./session";

// 管理端对玩家数据的写操作。共同约定:
//   · 每个动作先 requireAdmin,再校验目标用户存在;
//   · 落 admin_audit 留痕(谁、对谁、做了什么);
//   · revalidate 该用户详情页,前端 router.refresh 看到最新值。
// 派生量(等级/解锁)不能直接改标志——只能通过写底层行(xp_events / 进度)达成。

export interface AdminActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

const COIN_CAP = 100_000_000;
const XP_CAP = 100_000_000;

function ok(message?: string): AdminActionResult {
  return { ok: true, message };
}
function fail(error: string): AdminActionResult {
  return { ok: false, error };
}

function audit(
  admin: AdminUser,
  action: string,
  targetUserId: number,
  detail: unknown,
) {
  db.insert(adminAudit)
    .values({
      adminUserId: admin.id,
      action,
      targetUserId,
      detail: JSON.stringify(detail),
      createdAt: Date.now(),
    })
    .run();
}

function userExists(userId: number): boolean {
  return !!db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get();
}

function reval(userId: number) {
  revalidatePath(`/console/users/${userId}`);
}

// ---- 数值 ----

export async function adminGrantXp(
  userId: number,
  amount: number,
  note?: string,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!userExists(userId)) return fail("用户不存在");
  if (!Number.isInteger(amount) || amount === 0) return fail("XP 增减需为非零整数");
  if (Math.abs(amount) > XP_CAP) return fail("数额过大");

  db.insert(xpEvents)
    .values({
      userId,
      amount,
      reason: "admin",
      ref: `admin:${crypto.randomUUID()}`,
      createdAt: Date.now(),
    })
    .run();
  audit(admin, "grant_xp", userId, { amount, note: note ?? null });
  reval(userId);
  return ok(`已${amount > 0 ? "增加" : "扣除"} ${Math.abs(amount)} XP`);
}

export async function adminSetCoins(
  userId: number,
  coins: number,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!userExists(userId)) return fail("用户不存在");
  if (!Number.isInteger(coins) || coins < 0 || coins > COIN_CAP) {
    return fail("金币需为 0 到 1 亿的整数");
  }
  const now = Date.now();
  db.insert(rpgProfiles)
    .values({ userId, coins, updatedAt: now })
    .onConflictDoUpdate({
      target: rpgProfiles.userId,
      set: { coins, updatedAt: now },
    })
    .run();
  audit(admin, "set_coins", userId, { coins });
  reval(userId);
  return ok(`金币已设为 ${coins}`);
}

export async function adminSetShieldHearts(
  userId: number,
  value: number,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!userExists(userId)) return fail("用户不存在");
  const v = Math.max(0, Math.min(MAX_SHIELD_HEARTS, Math.round(value)));
  const now = Date.now();
  db.insert(rpgProfiles)
    .values({ userId, shieldHearts: v, updatedAt: now })
    .onConflictDoUpdate({
      target: rpgProfiles.userId,
      set: { shieldHearts: v, updatedAt: now },
    })
    .run();
  audit(admin, "set_shield", userId, { value: v });
  reval(userId);
  return ok(`护盾已设为 ${v}`);
}

export async function adminGiveItem(
  userId: number,
  itemId: string,
  delta: number,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!userExists(userId)) return fail("用户不存在");
  const id = itemId.trim();
  if (!id) return fail("道具 id 不能为空");
  if (!Number.isInteger(delta) || delta === 0) return fail("数量需为非零整数");

  const now = Date.now();
  const cur =
    db
      .select({ q: rpgInventory.quantity })
      .from(rpgInventory)
      .where(and(eq(rpgInventory.userId, userId), eq(rpgInventory.itemId, id)))
      .get()?.q ?? 0;
  const next = Math.max(0, cur + delta);
  if (next === 0) {
    db.delete(rpgInventory)
      .where(and(eq(rpgInventory.userId, userId), eq(rpgInventory.itemId, id)))
      .run();
  } else {
    db.insert(rpgInventory)
      .values({ userId, itemId: id, quantity: next, acquiredAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: [rpgInventory.userId, rpgInventory.itemId],
        set: { quantity: next, updatedAt: now },
      })
      .run();
  }
  audit(admin, "give_item", userId, { itemId: id, delta, next });
  reval(userId);
  return ok(`${id} 数量 → ${next}`);
}

// ---- 进度 / 解锁 ----

function markCourseComplete(userId: number, courseId: string): boolean {
  const c = getContent().coursesById.get(courseId);
  if (!c) return false;
  const now = Date.now();
  for (let n = 1; n <= c.episodes.length; n++) {
    db.insert(episodeProgress)
      .values({ userId, courseId, episodeN: n, watchedAt: now })
      .onConflictDoNothing()
      .run();
  }
  db.insert(courseProgress)
    .values({ userId, courseId, status: "done", updatedAt: now })
    .onConflictDoUpdate({
      target: [courseProgress.userId, courseProgress.courseId],
      set: { status: "done", updatedAt: now },
    })
    .run();
  return true;
}

export async function adminSetCourseStatus(
  userId: number,
  courseId: string,
  status: CourseStatus,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!userExists(userId)) return fail("用户不存在");
  if (!getContent().coursesById.has(courseId)) return fail("课程不存在");
  if (!COURSE_STATUSES.includes(status)) return fail("状态非法");

  const now = Date.now();
  db.insert(courseProgress)
    .values({ userId, courseId, status, updatedAt: now })
    .onConflictDoUpdate({
      target: [courseProgress.userId, courseProgress.courseId],
      set: { status, updatedAt: now },
    })
    .run();
  audit(admin, "set_course_status", userId, { courseId, status });
  reval(userId);
  return ok(`${courseId} 状态 → ${status}`);
}

export async function adminMarkCourseComplete(
  userId: number,
  courseId: string,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!userExists(userId)) return fail("用户不存在");
  if (!markCourseComplete(userId, courseId)) return fail("课程不存在");
  audit(admin, "mark_course_complete", userId, { courseId });
  reval(userId);
  return ok(`${courseId} 已标记为全部完成`);
}

export async function adminResetCourse(
  userId: number,
  courseId: string,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!userExists(userId)) return fail("用户不存在");
  db.delete(episodeProgress)
    .where(
      and(
        eq(episodeProgress.userId, userId),
        eq(episodeProgress.courseId, courseId),
      ),
    )
    .run();
  db.delete(courseProgress)
    .where(
      and(
        eq(courseProgress.userId, userId),
        eq(courseProgress.courseId, courseId),
      ),
    )
    .run();
  audit(admin, "reset_course", userId, { courseId });
  reval(userId);
  return ok(`已清除 ${courseId} 的进度`);
}

/** 强制解锁:把该课的所有(传递)前置课标记为完成,使解锁自然派生为真。 */
export async function adminForceUnlock(
  userId: number,
  courseId: string,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!userExists(userId)) return fail("用户不存在");
  const content = getContent();
  const target = content.coursesById.get(courseId);
  if (!target) return fail("课程不存在");

  // 收集传递前置(存在于内容里的)
  const prereqs = new Set<string>();
  const walk = (cid: string) => {
    const c = content.coursesById.get(cid);
    if (!c) return;
    for (const p of c.prerequisites) {
      if (content.coursesById.has(p) && !prereqs.has(p)) {
        prereqs.add(p);
        walk(p);
      }
    }
  };
  walk(courseId);

  let done = 0;
  for (const p of prereqs) {
    if (markCourseComplete(userId, p)) done++;
  }
  audit(admin, "force_unlock", userId, {
    courseId,
    completedPrereqs: [...prereqs],
  });
  reval(userId);
  return ok(
    prereqs.size === 0
      ? "该课本无前置,已可直接学习"
      : `已补齐 ${done} 门前置课,${courseId} 现已解锁`,
  );
}
