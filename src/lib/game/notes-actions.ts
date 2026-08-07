"use server";

import { and, asc, eq } from "drizzle-orm";
import { getCurrentUser } from "../auth/session";
import { getContent } from "../content/load";
import { db } from "../db/client";
import { videoNotes } from "../db/schema";

// 视频笔记的读写。笔记只对本人可见,正文是 Markdown 原文——
// 渲染(转义在前的安全子集)在客户端做,见 src/lib/markdown.ts。

const MAX_LEN = 8000;

export interface VideoNoteDto {
  id: number;
  episodeN: number;
  tSec: number;
  contentMd: string;
  updatedAt: number;
}

export interface NoteMutationResult {
  ok: boolean;
  error?: string;
  note?: VideoNoteDto;
}

/** 某课程的全部笔记(升序:集号 → 时间戳),面板按当前集过滤 */
export async function listVideoNotes(
  courseId: string,
): Promise<VideoNoteDto[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  return db
    .select({
      id: videoNotes.id,
      episodeN: videoNotes.episodeN,
      tSec: videoNotes.tSec,
      contentMd: videoNotes.contentMd,
      updatedAt: videoNotes.updatedAt,
    })
    .from(videoNotes)
    .where(
      and(eq(videoNotes.userId, user.id), eq(videoNotes.courseId, courseId)),
    )
    .orderBy(asc(videoNotes.episodeN), asc(videoNotes.tSec))
    .all();
}

export async function addVideoNote(
  courseId: string,
  episodeN: number,
  tSec: number,
  contentMd: string,
): Promise<NoteMutationResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  const course = getContent().coursesById.get(courseId);
  if (!course) return { ok: false, error: "课程不存在" };
  if (!course.episodes.some((e) => e.n === episodeN)) {
    return { ok: false, error: "集数不存在" };
  }
  const text = contentMd.trim();
  if (!text) return { ok: false, error: "笔记不能为空" };
  if (text.length > MAX_LEN) return { ok: false, error: "笔记太长了" };
  const t = Number.isFinite(tSec) ? Math.max(0, Math.round(tSec)) : 0;

  const now = Date.now();
  const inserted = db
    .insert(videoNotes)
    .values({
      userId: user.id,
      courseId,
      episodeN,
      tSec: t,
      contentMd: text,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: videoNotes.id })
    .get();
  return {
    ok: true,
    note: {
      id: inserted.id,
      episodeN,
      tSec: t,
      contentMd: text,
      updatedAt: now,
    },
  };
}

export async function updateVideoNote(
  id: number,
  contentMd: string,
): Promise<NoteMutationResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };
  const text = contentMd.trim();
  if (!text) return { ok: false, error: "笔记不能为空" };
  if (text.length > MAX_LEN) return { ok: false, error: "笔记太长了" };

  const updated = db
    .update(videoNotes)
    .set({ contentMd: text, updatedAt: Date.now() })
    .where(and(eq(videoNotes.id, id), eq(videoNotes.userId, user.id)))
    .returning({ id: videoNotes.id })
    .get();
  if (!updated) return { ok: false, error: "笔记不存在" };
  return { ok: true };
}

export async function deleteVideoNote(
  id: number,
): Promise<NoteMutationResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };
  db.delete(videoNotes)
    .where(and(eq(videoNotes.id, id), eq(videoNotes.userId, user.id)))
    .run();
  return { ok: true };
}
