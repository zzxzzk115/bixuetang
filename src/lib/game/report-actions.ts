"use server";

import { getCurrentUser } from "../auth/session";
import { db } from "../db/client";
import { videoReports } from "../db/schema";

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
