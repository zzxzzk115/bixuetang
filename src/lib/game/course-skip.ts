import "server-only";

import { sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  courseProgress,
  episodeProgress,
  rpgProfiles,
  xpEvents,
} from "../db/schema";
import { getContent } from "../content/load";
import { recordFeed } from "./feed";
import { XP_REASON } from "./xp";

// 跳过整门课的共用逻辑(跳级考、入学分级测共用):全集标记已学、置为完成
// (从而解锁后续课程)、发一次性固定奖励。全部幂等,首次跳过才发金币与好友动态。

/** 跳过一门课的一次性固定奖励(明显低于逐集学完,只作掌握凭据) */
export const SKIP_XP = 60;
export const SKIP_COINS = 30;

export interface SkipOutcome {
  /** 本次真正发放的 XP(重复跳过为 0) */
  gained: number;
  coins: number;
  /** 本次是不是首次把这门课跳过(用于统计/展示) */
  wasNew: boolean;
}

/** 把 courseId 标记为已学完并发一次性奖励(幂等)。调用方负责 revalidate。 */
export function skipCourse(
  userId: number,
  courseId: string,
  now = Date.now(),
): SkipOutcome {
  const course = getContent().coursesById.get(courseId);
  if (!course) return { gained: 0, coins: 0, wasNew: false };

  // 全集标记已学(不发逐集 XP/掉落)
  for (const ep of course.episodes) {
    db.insert(episodeProgress)
      .values({ userId, courseId, episodeN: ep.n, watchedAt: now })
      .onConflictDoNothing()
      .run();
  }
  // 本课置为已完成 → 满足后续课程前置,自动解锁
  db.insert(courseProgress)
    .values({ userId, courseId, status: "done", updatedAt: now })
    .onConflictDoUpdate({
      target: [courseProgress.userId, courseProgress.courseId],
      set: { status: "done", updatedAt: now },
    })
    .run();

  // 一次性固定奖励(幂等键 reason+ref);首次才发金币与好友动态
  const inserted = db
    .insert(xpEvents)
    .values({
      userId,
      amount: SKIP_XP,
      reason: XP_REASON.skip,
      ref: courseId,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ amount: xpEvents.amount })
    .get();

  if (!inserted) return { gained: 0, coins: 0, wasNew: false };

  db.insert(rpgProfiles)
    .values({ userId, coins: SKIP_COINS, updatedAt: now })
    .onConflictDoUpdate({
      target: rpgProfiles.userId,
      set: { coins: sql`${rpgProfiles.coins} + ${SKIP_COINS}`, updatedAt: now },
    })
    .run();
  recordFeed(userId, "course_done", courseId, { courseTitle: course.title });

  return { gained: SKIP_XP, coins: SKIP_COINS, wasNew: true };
}
