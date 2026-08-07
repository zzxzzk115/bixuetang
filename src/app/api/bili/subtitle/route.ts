import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { ccOffsets } from "@/lib/db/schema";
import { getBiliSessdata } from "@/lib/bili/account";
import { fetchSubtitles } from "@/lib/bili/api";
import { loadRepoSubtitle } from "@/lib/content/subtitles";
import { dropOutclassedEnglish } from "@/lib/subtitle-prefer";

// CC 字幕：服务端拉取并转成 JSON 下发（字幕源要 Referer，且多数需登录态）。
// 仓库自带的字幕轨（content/subtitles/，通常是官方 YouTube CC）一并附上；
// bilibili 英文轨明显残缺时被仓库轨替换（规则见 lib/subtitle-prefer.ts）。

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });

  const bvid = request.nextUrl.searchParams.get("bvid");
  const cid = Number(request.nextUrl.searchParams.get("cid"));
  const duration = Number(request.nextUrl.searchParams.get("duration")) || undefined;
  if (!bvid || !/^BV[0-9A-Za-z]{8,}$/.test(bvid)) {
    return Response.json({ error: "bvid 不合法" }, { status: 400 });
  }
  if (!Number.isInteger(cid) || cid <= 0) {
    return Response.json({ error: "cid 不合法" }, { status: 400 });
  }

  // 用户为这个视频校准过的字幕偏移，跟字幕一起下发省一次往返
  const offsetMs =
    db
      .select({ offsetMs: ccOffsets.offsetMs })
      .from(ccOffsets)
      .where(and(eq(ccOffsets.userId, user.id), eq(ccOffsets.cid, cid)))
      .get()?.offsetMs ?? 0;

  // 仓库字幕轨(可选参数,老客户端不传也不影响 bilibili 轨)
  const courseId = request.nextUrl.searchParams.get("courseId");
  const episodeN = Number(request.nextUrl.searchParams.get("ep"));
  const repoTrack =
    courseId && /^[a-z0-9-]+$/.test(courseId) && Number.isInteger(episodeN)
      ? loadRepoSubtitle(courseId, episodeN)
      : null;

  try {
    const tracks = await fetchSubtitles(
      bvid,
      cid,
      getBiliSessdata(user.id) ?? undefined,
      duration,
    );
    const kept = dropOutclassedEnglish(tracks, repoTrack);
    return Response.json({
      tracks: repoTrack ? [...kept, repoTrack] : kept,
      offsetMs,
    });
  } catch {
    return Response.json({ tracks: repoTrack ? [repoTrack] : [], offsetMs });
  }
}
