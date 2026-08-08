"use server";

import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "../auth/session";
import { getContent } from "../content/load";
import { db } from "../db/client";
import { courseTips } from "../db/schema";
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
