import "server-only";
import { and, eq } from "drizzle-orm";
import { getContent } from "../content/load";
import { resolveVideo, type VideoHit } from "../content/video-index";
import { db } from "../db/client";
import { courseProgress, episodeProgress, xpEvents } from "../db/schema";
import { levelFromXp } from "../game/level";
import { courseBonusXp, episodeRef, episodeXp, XP_REASON } from "../game/xp";
import { getTotalXp } from "./queries";

// 浏览器插件上报的观看事件 → 课程进度。
// 与 toggleEpisode 共享同一套幂等规则（xp_events 唯一键），
// 但入口是 token 鉴权的 API 而非 Server Action。

export interface WatchReport {
  videoId: string;
  page?: number;
  /** 已播放比例 0–1，达到阈值才计入 */
  ratio?: number;
}

export interface WatchOutcome {
  matched: boolean;
  courseId?: string;
  courseTitle?: string;
  episodeN?: number;
  episodeTitle?: string;
  /** 本次是否新标记（重复上报为 false） */
  recorded: boolean;
  gained: number;
  totalXp: number;
  level: number;
  levelUp: boolean;
  courseDone: boolean;
}

/** 播放达到该比例才算「看过」，避免刚点开就记进度 */
export const WATCH_THRESHOLD = 0.8;

export function recordWatch(
  userId: number,
  report: WatchReport,
): WatchOutcome {
  const hit: VideoHit | null = resolveVideo(report.videoId, report.page);
  if (!hit) {
    return {
      matched: false,
      recorded: false,
      gained: 0,
      totalXp: getTotalXp(userId),
      level: levelFromXp(getTotalXp(userId)),
      levelUp: false,
      courseDone: false,
    };
  }

  const base = {
    matched: true as const,
    courseId: hit.courseId,
    courseTitle: hit.courseTitle,
    episodeN: hit.episodeN,
    episodeTitle: hit.episodeTitle,
  };

  const before = getTotalXp(userId);
  const levelBefore = levelFromXp(before);

  // 未达阈值：只回报匹配结果，不写进度
  if ((report.ratio ?? 1) < WATCH_THRESHOLD) {
    return {
      ...base,
      recorded: false,
      gained: 0,
      totalXp: before,
      level: levelBefore,
      levelUp: false,
      courseDone: false,
    };
  }

  const course = getContent().coursesById.get(hit.courseId)!;
  const now = Date.now();

  const inserted = db
    .insert(episodeProgress)
    .values({
      userId,
      courseId: hit.courseId,
      episodeN: hit.episodeN,
      watchedAt: now,
    })
    .onConflictDoNothing()
    .returning({ n: episodeProgress.episodeN })
    .get();

  db.insert(xpEvents)
    .values({
      userId,
      amount: episodeXp(course.level),
      reason: XP_REASON.episode,
      ref: episodeRef(hit.courseId, hit.episodeN),
      createdAt: now,
    })
    .onConflictDoNothing()
    .run();

  const current = db
    .select({ status: courseProgress.status })
    .from(courseProgress)
    .where(
      and(
        eq(courseProgress.userId, userId),
        eq(courseProgress.courseId, hit.courseId),
      ),
    )
    .get();
  if (!current || current.status === "planned") {
    db.insert(courseProgress)
      .values({
        userId,
        courseId: hit.courseId,
        status: "learning",
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [courseProgress.userId, courseProgress.courseId],
        set: { status: "learning", updatedAt: now },
      })
      .run();
  }

  // 全集看完 → Boss 结算（幂等）
  const watchedCount = db
    .select({ n: episodeProgress.episodeN })
    .from(episodeProgress)
    .where(
      and(
        eq(episodeProgress.userId, userId),
        eq(episodeProgress.courseId, hit.courseId),
      ),
    )
    .all().length;

  let courseDone = false;
  if (watchedCount >= course.episodes.length) {
    courseDone = true;
    db.insert(xpEvents)
      .values({
        userId,
        amount: courseBonusXp(course.episodes.length, course.level),
        reason: XP_REASON.courseDone,
        ref: hit.courseId,
        createdAt: now,
      })
      .onConflictDoNothing()
      .run();
    db.insert(courseProgress)
      .values({ userId, courseId: hit.courseId, status: "done", updatedAt: now })
      .onConflictDoUpdate({
        target: [courseProgress.userId, courseProgress.courseId],
        set: { status: "done", updatedAt: now },
      })
      .run();
  }

  const totalXp = getTotalXp(userId);
  const level = levelFromXp(totalXp);
  return {
    ...base,
    recorded: inserted !== undefined,
    gained: totalXp - before,
    totalXp,
    level,
    levelUp: level > levelBefore,
    courseDone,
  };
}
