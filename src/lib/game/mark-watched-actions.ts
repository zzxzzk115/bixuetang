"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth/session";
import { getContent } from "../content/load";
import { db } from "../db/client";
import { courseProgress, episodeProgress } from "../db/schema";
import { getGameBootstrap } from "./bootstrap";
import { recordActivity } from "./streak-server";
import { courseHasQuiz } from "./quiz-bank";

// 纯视频课(没题库、开不了跳级考,如纪录片)标记为「已看过」:全集标记已学、
// 置为完成从而解锁后续课程。**不发奖励**(没考核,凭自觉),避免白刷 XP;
// 有题库的课不走这里,得做综合测验跳级(那才有奖励)。

export async function markCourseWatched(
  courseId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  const course = getContent().coursesById.get(courseId);
  if (!course) return { ok: false, error: "课程不存在" };
  // 有题库的课必须做综合测验跳级,不能凭点一下就跳
  if (courseHasQuiz(courseId)) {
    return { ok: false, error: "这门课请用综合测验跳级" };
  }

  const summary = getGameBootstrap(user).courses.find((c) => c.id === courseId);
  if (summary && !summary.unlocked) {
    return { ok: false, error: "课程还没解锁" };
  }

  const now = Date.now();
  // 全集标记已学(幂等),不发逐集 XP/掉落
  for (const ep of course.episodes) {
    db.insert(episodeProgress)
      .values({ userId: user.id, courseId, episodeN: ep.n, watchedAt: now })
      .onConflictDoNothing()
      .run();
  }
  const cur = db
    .select({ status: courseProgress.status })
    .from(courseProgress)
    .where(
      and(
        eq(courseProgress.userId, user.id),
        eq(courseProgress.courseId, courseId),
      ),
    )
    .get();
  db.insert(courseProgress)
    .values({ userId: user.id, courseId, status: "done", updatedAt: now })
    .onConflictDoUpdate({
      target: [courseProgress.userId, courseProgress.courseId],
      set: { status: "done", updatedAt: now },
    })
    .run();
  // 首次标记完成也算当天学习行为 → 推进连胜(幂等)
  if (cur?.status !== "done") recordActivity(user.id);

  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/play");
  revalidatePath("/me");
  return { ok: true };
}
