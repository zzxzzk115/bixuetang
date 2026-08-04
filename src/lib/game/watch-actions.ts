"use server";

import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "../auth/session";
import { getContent } from "../content/load";
import { db } from "../db/client";
import { episodeWatch } from "../db/schema";
import { toggleEpisode, type ToggleResult } from "../progress/actions";
import { isComplete, watchRatioPct } from "./watch-rules";

// 自研播放器的观看进度上报。
// 「看完」的判定：观看覆盖率 ≥ 90%（跳着看也算——学习不是考勤）。
// 达标即自动打卡（走 toggleEpisode，XP/掉落/药水结算全部复用既有链路）。

export interface WatchReport {
  ok: boolean;
  error?: string;
  ratioPct?: number;
  /** 本次刚好达标并自动打卡 */
  completed?: boolean;
  settle?: ToggleResult;
}

export async function reportWatchProgress(
  courseId: string,
  episodeN: number,
  positionSec: number,
  durationSec: number,
  /** 客户端累计的实际观看秒数（跳过的部分不计） */
  watchedSec: number,
): Promise<WatchReport> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  const course = getContent().coursesById.get(courseId);
  if (!course) return { ok: false, error: "课程不存在" };
  if (!course.episodes.some((e) => e.n === episodeN)) {
    return { ok: false, error: "集数不存在" };
  }
  if (
    !Number.isFinite(positionSec) ||
    !Number.isFinite(durationSec) ||
    !Number.isFinite(watchedSec) ||
    durationSec <= 0
  ) {
    return { ok: false, error: "非法进度" };
  }

  const ratioPct = watchRatioPct(watchedSec, durationSec);
  const now = Date.now();

  const prev = db
    .select({ ratioPct: episodeWatch.ratioPct })
    .from(episodeWatch)
    .where(
      and(
        eq(episodeWatch.userId, user.id),
        eq(episodeWatch.courseId, courseId),
        eq(episodeWatch.episodeN, episodeN),
      ),
    )
    .get();

  db.insert(episodeWatch)
    .values({
      userId: user.id,
      courseId,
      episodeN,
      positionSec: Math.round(positionSec),
      durationSec: Math.round(durationSec),
      // 覆盖率只增不减（换设备重看不该把进度打回去）
      ratioPct: Math.max(ratioPct, prev?.ratioPct ?? 0),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        episodeWatch.userId,
        episodeWatch.courseId,
        episodeWatch.episodeN,
      ],
      set: {
        positionSec: Math.round(positionSec),
        durationSec: Math.round(durationSec),
        ratioPct: Math.max(ratioPct, prev?.ratioPct ?? 0),
        updatedAt: now,
      },
    })
    .run();

  const wasComplete = isComplete(prev?.ratioPct ?? 0);
  const nowComplete = isComplete(ratioPct);
  if (nowComplete && !wasComplete) {
    const settle = await toggleEpisode(courseId, episodeN, true);
    return { ok: true, ratioPct, completed: true, settle };
  }
  return { ok: true, ratioPct, completed: false };
}

/** 读取某课程各集的观看进度（续播用） */
export async function getWatchProgress(
  courseId: string,
): Promise<Record<number, { positionSec: number; ratioPct: number }>> {
  const user = await getCurrentUser();
  if (!user) return {};
  const rows = db
    .select()
    .from(episodeWatch)
    .where(
      and(
        eq(episodeWatch.userId, user.id),
        eq(episodeWatch.courseId, courseId),
      ),
    )
    .all();
  const out: Record<number, { positionSec: number; ratioPct: number }> = {};
  for (const r of rows) {
    out[r.episodeN] = { positionSec: r.positionSec, ratioPct: r.ratioPct };
  }
  return out;
}
