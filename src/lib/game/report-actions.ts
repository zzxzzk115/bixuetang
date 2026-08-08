"use server";

import { desc, eq } from "drizzle-orm";
import { getCurrentAdmin } from "../admin/session";
import { getCurrentUser } from "../auth/session";
import { getContent } from "../content/load";
import { db } from "../db/client";
import { users, videoReports } from "../db/schema";

// 视频失效反馈。播放器解析不出流(主源+全部备源都挂)或用户发现内容不对时,
// 点「视频不见了」落一行给运营。同一 (用户,课程,集,稿件) 只留最近一次。

export type VideoReportKind = "gone" | "wrong" | "other";

export interface ReportResult {
  ok: boolean;
  error?: string;
}

export async function reportVideoIssue(input: {
  courseId: string;
  episodeN: number;
  bvid: string;
  kind?: VideoReportKind;
  note?: string;
}): Promise<ReportResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  const courseId = String(input.courseId ?? "").slice(0, 120);
  const episodeN = Number(input.episodeN);
  const bvid = String(input.bvid ?? "").slice(0, 32);
  const kind: VideoReportKind =
    input.kind === "wrong" || input.kind === "other" ? input.kind : "gone";
  const note = input.note ? input.note.trim().slice(0, 500) : null;

  if (!courseId || !Number.isInteger(episodeN) || episodeN <= 0 || !bvid) {
    return { ok: false, error: "参数不完整" };
  }

  try {
    await db
      .insert(videoReports)
      .values({
        userId: user.id,
        courseId,
        episodeN,
        bvid,
        kind,
        note,
        resolved: false,
        createdAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: [
          videoReports.userId,
          videoReports.courseId,
          videoReports.episodeN,
          videoReports.bvid,
        ],
        // 同一用户对同一稿件再次反馈:刷新时间与内容,重新标记为待处理。
        set: { kind, note, resolved: false, createdAt: Date.now() },
      });
    return { ok: true };
  } catch {
    return { ok: false, error: "反馈没提交上,稍后再试" };
  }
}

// ---- 运营侧:查看与处理反馈(仅管理员) ----

export interface VideoReportRow {
  id: number;
  courseId: string;
  courseTitle: string;
  episodeN: number;
  episodeTitle: string;
  bvid: string;
  kind: VideoReportKind;
  note: string | null;
  resolved: boolean;
  reporter: string;
  createdAt: number;
}

/** 反馈列表(未处理在前,再按时间倒序)。非管理员返回 null,页面据此 404。 */
export async function listVideoReports(): Promise<VideoReportRow[] | null> {
  const admin = await getCurrentAdmin();
  if (!admin) return null;

  const rows = await db
    .select({
      id: videoReports.id,
      courseId: videoReports.courseId,
      episodeN: videoReports.episodeN,
      bvid: videoReports.bvid,
      kind: videoReports.kind,
      note: videoReports.note,
      resolved: videoReports.resolved,
      createdAt: videoReports.createdAt,
      reporter: users.username,
    })
    .from(videoReports)
    .innerJoin(users, eq(videoReports.userId, users.id))
    .orderBy(desc(videoReports.createdAt));

  const content = getContent();
  return rows
    .map((r) => {
      const course = content.coursesById.get(r.courseId);
      const ep = course?.episodes.find((e) => e.n === r.episodeN);
      return {
        id: r.id,
        courseId: r.courseId,
        courseTitle: course?.title ?? r.courseId,
        episodeN: r.episodeN,
        episodeTitle: ep?.title ?? `第 ${r.episodeN} 集`,
        bvid: r.bvid,
        kind: (r.kind as VideoReportKind) ?? "gone",
        note: r.note,
        resolved: !!r.resolved,
        reporter: r.reporter,
        createdAt: r.createdAt,
      };
    })
    .sort((a, b) =>
      a.resolved === b.resolved
        ? b.createdAt - a.createdAt
        : a.resolved
          ? 1
          : -1,
    );
}

/** 标记某条反馈已处理 / 重新打开(仅管理员)。 */
export async function setReportResolved(
  id: number,
  resolved: boolean,
): Promise<ReportResult> {
  const admin = await getCurrentAdmin();
  if (!admin) return { ok: false, error: "无权限" };
  if (!Number.isInteger(id)) return { ok: false, error: "参数不完整" };
  try {
    await db
      .update(videoReports)
      .set({ resolved })
      .where(eq(videoReports.id, id));
    return { ok: true };
  } catch {
    return { ok: false, error: "操作失败,稍后再试" };
  }
}
