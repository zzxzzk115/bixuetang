"use server";

import { and, desc, eq } from "drizzle-orm";
import { getCurrentAdmin } from "../admin/session";
import { getCurrentUser } from "../auth/session";
import { getContent } from "../content/load";
import { db } from "../db/client";
import { courseTips, users } from "../db/schema";
import { containsSensitive } from "../moderation/filter";

// 课程心得的写侧:发/删(只能删自己的)。文本过敏感词、限长。

export async function postCourseTip(
  courseId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };
  if (!getContent().coursesById.has(courseId)) return { ok: false };
  const t = text.trim().slice(0, 300);
  if (!t) return { ok: false, error: "写点心得再发吧" };
  if (containsSensitive(t)) return { ok: false, error: "内容含有不当词汇,请修改" };
  db.insert(courseTips)
    .values({ courseId, userId: user.id, text: t, createdAt: Date.now() })
    .run();
  return { ok: true };
}

export async function deleteCourseTip(id: number): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  db.delete(courseTips)
    .where(and(eq(courseTips.id, id), eq(courseTips.userId, user.id)))
    .run();
  return { ok: true };
}

export interface AdminTipRow {
  id: number;
  text: string;
  username: string;
  courseId: string;
  courseTitle: string;
  createdAt: number;
}

// 管理端:列出全站课程心得(按时间倒序),供审核/下架。
// 敏感词过滤只拦命中词库的;漏网/不当但未入库的内容需要人工兜底。
export async function listAllTips(): Promise<AdminTipRow[] | null> {
  const admin = await getCurrentAdmin();
  if (!admin) return null;
  const byId = getContent().coursesById;
  const rows = db
    .select({
      id: courseTips.id,
      text: courseTips.text,
      username: users.username,
      courseId: courseTips.courseId,
      createdAt: courseTips.createdAt,
    })
    .from(courseTips)
    .innerJoin(users, eq(users.id, courseTips.userId))
    .orderBy(desc(courseTips.createdAt))
    .limit(200)
    .all();
  return rows.map((r) => ({
    ...r,
    courseTitle: byId.get(r.courseId)?.title ?? r.courseId,
  }));
}

// 管理端:下架任意用户的课程心得
export async function adminDeleteTip(id: number): Promise<{ ok: boolean }> {
  const admin = await getCurrentAdmin();
  if (!admin) return { ok: false };
  if (!Number.isInteger(id)) return { ok: false };
  db.delete(courseTips).where(eq(courseTips.id, id)).run();
  return { ok: true };
}
