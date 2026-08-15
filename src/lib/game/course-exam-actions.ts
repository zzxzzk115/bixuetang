"use server";

import { sql } from "drizzle-orm";
import { getCurrentUser } from "../auth/session";
import { getContent } from "../content/load";
import { db } from "../db/client";
import {
  courseProgress,
  episodeProgress,
  rpgProfiles,
  xpEvents,
} from "../db/schema";
import { getTotalXp } from "../progress/queries";
import { getGameBootstrap } from "./bootstrap";
import { levelFromXp } from "./level";
import { XP_REASON } from "./xp";
import { recordFeed } from "./feed";
import { recordActivity } from "./streak-server";
import { detectAchievements, type JustUnlocked } from "./achievements";
import {
  EXAM_PASS_RATIO,
  SKIP_COINS,
  SKIP_XP,
  examQuestionsForSeed,
} from "./course-exam";
import { courseHasQuiz } from "./quiz-bank";

// 跳级考交卷:服务端按 seed 复现考卷、核对答案(不信客户端转述的分数)。
// ≥70% 即跳过整门课——全集标记已学、解锁后续课程、发一次性固定 XP+金币(幂等)。

export interface ExamResult {
  ok: boolean;
  error?: string;
  passed?: boolean;
  correct?: number;
  total?: number;
  pct?: number;
  /** 是否本次真的执行了跳级 */
  skipped?: boolean;
  /** 之前已跳过(幂等,不再发奖) */
  alreadyDone?: boolean;
  gained?: number;
  coins?: number;
  levelUp?: boolean;
  newLevel?: number;
  courseTitle?: string;
  achievements?: JustUnlocked[];
}

export async function submitCourseExam(
  courseId: string,
  seed: number,
  answers: number[],
): Promise<ExamResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  const course = getContent().coursesById.get(courseId);
  if (!course) return { ok: false, error: "课程不存在" };
  if (!courseHasQuiz(courseId)) return { ok: false, error: "该课程不支持跳级" };

  // 未解锁的课不能跳级(前置没打底就想跳,拦住)
  const summary = getGameBootstrap(user).courses.find((c) => c.id === courseId);
  if (summary && !summary.unlocked) {
    return { ok: false, error: "课程还没解锁" };
  }

  // 按 seed 复现考卷并核对(答案不信客户端)
  const questions = examQuestionsForSeed(courseId, Number(seed));
  if (questions.length === 0) return { ok: false, error: "考卷已失效,请重开" };
  if (!Array.isArray(answers) || answers.length !== questions.length) {
    return { ok: false, error: "答卷不完整" };
  }
  let correct = 0;
  for (let i = 0; i < questions.length; i++) {
    if (answers[i] === questions[i].answerIndex) correct++;
  }
  const total = questions.length;
  const pct = Math.round((100 * correct) / total);
  const passed = correct / total >= EXAM_PASS_RATIO;
  if (!passed) {
    return { ok: true, passed: false, correct, total, pct };
  }

  // —— 通过:执行跳级(全部幂等) ——
  const now = Date.now();
  const before = getTotalXp(user.id);

  // 全集标记已学(不发逐集 XP/掉落——跳级只给一次性固定奖励)
  for (const ep of course.episodes) {
    db.insert(episodeProgress)
      .values({ userId: user.id, courseId, episodeN: ep.n, watchedAt: now })
      .onConflictDoNothing()
      .run();
  }
  // 本课置为已完成 → 满足后续课程的前置,自动解锁下一门
  db.insert(courseProgress)
    .values({ userId: user.id, courseId, status: "done", updatedAt: now })
    .onConflictDoUpdate({
      target: [courseProgress.userId, courseProgress.courseId],
      set: { status: "done", updatedAt: now },
    })
    .run();

  // 一次性固定奖励(幂等键 reason+ref);首次才发金币与好友动态
  const inserted = db
    .insert(xpEvents)
    .values({
      userId: user.id,
      amount: SKIP_XP,
      reason: XP_REASON.skip,
      ref: courseId,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ amount: xpEvents.amount })
    .get();

  let gained = 0;
  let coins = 0;
  if (inserted) {
    gained = inserted.amount;
    coins = SKIP_COINS;
    db.insert(rpgProfiles)
      .values({ userId: user.id, coins, updatedAt: now })
      .onConflictDoUpdate({
        target: rpgProfiles.userId,
        set: { coins: sql`${rpgProfiles.coins} + ${coins}`, updatedAt: now },
      })
      .run();
    recordFeed(user.id, "course_done", courseId, { courseTitle: course.title });
  }

  // 通过考试也是当天的学习行为 → 推进连胜(幂等)
  recordActivity(user.id);

  const totalXp = getTotalXp(user.id);
  const achievements = detectAchievements(user.id);
  // 注意:不能在这里 revalidatePath——会连当前跳级考页一起刷新,把结算页顶掉
  // (同 submitQuizNode 的坑)。/play、/me、课程页都是按用户动态渲染,
  // 交卷后客户端 router.push 过去自然是新状态。

  return {
    ok: true,
    passed: true,
    skipped: true,
    alreadyDone: !inserted,
    correct,
    total,
    pct,
    gained,
    coins,
    levelUp: levelFromXp(totalXp) > levelFromXp(before),
    newLevel: levelFromXp(totalXp),
    courseTitle: course.title,
    achievements,
  };
}
