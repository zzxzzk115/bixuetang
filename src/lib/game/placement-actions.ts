"use server";

import { getCurrentUser } from "../auth/session";
import { getContent } from "../content/load";
import { getTotalXp } from "../progress/queries";
import { levelFromXp } from "./level";
import { recordActivity } from "./streak-server";
import { detectAchievements, type JustUnlocked } from "./achievements";
import { skipCourse } from "./course-skip";
import { PLACEMENT_PASS_RATIO, buildPlacementForSeed } from "./placement";

// 分级测交卷:服务端按 seed 复现考卷、逐门核对答案(不信客户端分数)。
// 从头连续答对 ≥70% 的课自动跳过(标记已学),落在第一门没过的课。

export interface PlacementResult {
  ok: boolean;
  error?: string;
  /** 测了几门课 */
  totalTested?: number;
  /** 连续通过、被跳过的门数 */
  skippedCount?: number;
  skippedTitles?: string[];
  /** 落在哪门课开始学(全通过则为 null) */
  placedInto?: string | null;
  allPassed?: boolean;
  gained?: number;
  coins?: number;
  levelUp?: boolean;
  newLevel?: number;
  achievements?: JustUnlocked[];
}

export async function submitPlacement(
  roadmapId: string,
  seed: number,
  answers: number[],
): Promise<PlacementResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };
  if (!getContent().roadmapsById.has(roadmapId)) {
    return { ok: false, error: "路线不存在" };
  }

  const { courses, questions } = buildPlacementForSeed(
    user.id,
    roadmapId,
    Number(seed),
  );
  if (courses.length === 0) return { ok: false, error: "分级测已失效,请重开" };
  if (!Array.isArray(answers) || answers.length !== questions.length) {
    return { ok: false, error: "答卷不完整" };
  }

  // 逐门切片计分,求「从头连续通过」的前缀
  let offset = 0;
  let passedPrefix = 0;
  let stillCounting = true;
  for (const c of courses) {
    let correct = 0;
    for (let j = 0; j < c.count; j++) {
      if (answers[offset + j] === questions[offset + j].answerIndex) correct++;
    }
    offset += c.count;
    const passed = correct / c.count >= PLACEMENT_PASS_RATIO;
    if (stillCounting && passed) passedPrefix++;
    else stillCounting = false;
  }

  const before = getTotalXp(user.id);
  let gained = 0;
  let coins = 0;
  const skippedTitles: string[] = [];
  for (let i = 0; i < passedPrefix; i++) {
    const o = skipCourse(user.id, courses[i].courseId);
    gained += o.gained;
    coins += o.coins;
    skippedTitles.push(courses[i].title);
  }
  if (passedPrefix > 0) recordActivity(user.id);

  const totalXp = getTotalXp(user.id);
  const achievements = detectAchievements(user.id);
  const allPassed = passedPrefix === courses.length;

  return {
    ok: true,
    totalTested: courses.length,
    skippedCount: passedPrefix,
    skippedTitles,
    placedInto: allPassed ? null : courses[passedPrefix].title,
    allPassed,
    gained,
    coins,
    levelUp: levelFromXp(totalXp) > levelFromXp(before),
    newLevel: levelFromXp(totalXp),
    achievements,
  };
}
