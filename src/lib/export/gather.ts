import "server-only";

import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { courseProgress, users, videoNotes } from "../db/schema";
import { getContent } from "../content/load";
import type { Course } from "../content/schema";
import { allTermInputs } from "../game/glossary-source";
import type { ExportBundle, ExportNote, ExportTerm } from "./format";

// 采集某用户的可导出数据(视频笔记 + 其学过课程的卷宗术语),拼成 ExportBundle。
// 格式化在 format.ts(纯函数),这里只管取数与深链解析。

function bvidOf(url: string): string | null {
  return url.match(/\/video\/(BV[0-9A-Za-z]+)/)?.[1] ?? null;
}

/** (课程,集,秒) → 跳回视频那一秒的深链;拿不到 bvid 返回 null */
function deepLink(course: Course, episodeN: number, tSec: number): string | null {
  const ep = course.episodes.find((e) => e.n === episodeN);
  const biliSrc = course.sources.find((s) => s.platform === "bilibili");
  const bvid = ep?.bvid ?? (biliSrc ? bvidOf(biliSrc.url) : null);
  if (!bvid) return null;
  const t = Math.max(0, Math.floor(tSec));
  // 合集课每集独立 bvid → 不带 p;多分 P 课 → 带 p=集号
  return ep?.bvid
    ? `https://www.bilibili.com/video/${bvid}?t=${t}`
    : `https://www.bilibili.com/video/${bvid}?p=${episodeN}&t=${t}`;
}

function dateStrCN(nowMs: number): string {
  return new Date(nowMs + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export function gatherExport(userId: number, now = Date.now()): ExportBundle {
  const content = getContent();
  const user = db.select().from(users).where(eq(users.id, userId)).get();

  const noteRows = db
    .select()
    .from(videoNotes)
    .where(eq(videoNotes.userId, userId))
    .all();

  const notes: ExportNote[] = noteRows.map((r) => {
    const course = content.coursesById.get(r.courseId);
    const ep = course?.episodes.find((e) => e.n === r.episodeN);
    return {
      courseId: r.courseId,
      courseTitle: course?.title ?? r.courseId,
      episodeN: r.episodeN,
      episodeTitle: ep?.title ?? `第 ${r.episodeN} 集`,
      tSec: r.tSec,
      deepLink: course ? deepLink(course, r.episodeN, r.tSec) : null,
      contentMd: r.contentMd,
      updatedAt: r.updatedAt,
    };
  });

  // 术语:取用户「学过的课程」(有笔记 或 有课程进度)的卷宗术语
  const engaged = new Set<string>(noteRows.map((r) => r.courseId));
  for (const p of db
    .select({ courseId: courseProgress.courseId })
    .from(courseProgress)
    .where(eq(courseProgress.userId, userId))
    .all())
    engaged.add(p.courseId);

  const terms: ExportTerm[] = allTermInputs()
    .filter((t) => engaged.has(t.courseId))
    .map((t) => ({
      courseId: t.courseId,
      courseTitle: t.courseTitle,
      episodeN: t.episodeN,
      term: t.term,
      definition: t.definition,
    }));

  return {
    userName: user?.displayName || user?.username || "学员",
    generatedAt: now,
    dateStr: dateStrCN(now),
    notes,
    terms,
  };
}
