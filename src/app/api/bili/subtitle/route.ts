import type { NextRequest } from "next/server";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { ccOffsets, ccTrackOffsets } from "@/lib/db/schema";
import { getBiliSessdata } from "@/lib/bili/account";
import { fetchSubtitles } from "@/lib/bili/api";
import { loadRepoSubtitle } from "@/lib/content/subtitles";
import { dropOutclassedEnglish } from "@/lib/subtitle-prefer";

// CC 字幕：服务端拉取并转成 JSON 下发（字幕源要 Referer，且多数需登录态）。
// 仓库自带的字幕轨（content/subtitles/，通常是官方 YouTube CC）一并附上；
// bilibili 英文轨明显残缺时被仓库轨替换（规则见 lib/subtitle-prefer.ts）。
//
// 时间轴偏移按「轨道」下发,优先级:
//   本人按轨设置 > 本人旧全局设置 > 众包默认(该轨报告人数最多的非零偏移)
// 用户在播放器里校准即是反馈,无需单独提交动作。

export const dynamic = "force-dynamic";

/** 某视频各轨的众包默认偏移:非零值按人数取众数,并列取更接近 0 的 */
function crowdOffsets(cid: number, excludeUserId: number): Record<string, number> {
  const rows = db
    .select({
      lan: ccTrackOffsets.lan,
      offsetMs: ccTrackOffsets.offsetMs,
      cnt: sql<number>`count(*)`,
    })
    .from(ccTrackOffsets)
    .where(
      and(
        eq(ccTrackOffsets.cid, cid),
        ne(ccTrackOffsets.offsetMs, 0),
        ne(ccTrackOffsets.userId, excludeUserId),
      ),
    )
    .groupBy(ccTrackOffsets.lan, ccTrackOffsets.offsetMs)
    .orderBy(desc(sql`count(*)`), sql`abs(${ccTrackOffsets.offsetMs}) asc`)
    .all();
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (!(r.lan in out)) out[r.lan] = r.offsetMs;
  }
  return out;
}

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

  // 偏移组装:众包默认打底 → 本人旧全局覆盖 → 本人按轨设置最优先
  const offsets = crowdOffsets(cid, user.id);
  const crowdLans = new Set(Object.keys(offsets));
  const legacy =
    db
      .select({ offsetMs: ccOffsets.offsetMs })
      .from(ccOffsets)
      .where(and(eq(ccOffsets.userId, user.id), eq(ccOffsets.cid, cid)))
      .get()?.offsetMs ?? 0;
  const own = db
    .select({ lan: ccTrackOffsets.lan, offsetMs: ccTrackOffsets.offsetMs })
    .from(ccTrackOffsets)
    .where(
      and(eq(ccTrackOffsets.userId, user.id), eq(ccTrackOffsets.cid, cid)),
    )
    .all();
  const ownLans = new Set(own.map((r) => r.lan));
  for (const r of own) offsets[r.lan] = r.offsetMs;

  // 仓库字幕轨(可选参数,老客户端不传也不影响 bilibili 轨)
  const courseId = request.nextUrl.searchParams.get("courseId");
  const episodeN = Number(request.nextUrl.searchParams.get("ep"));
  const repoTrack =
    courseId && /^[a-z0-9-]+$/.test(courseId) && Number.isInteger(episodeN)
      ? loadRepoSubtitle(courseId, episodeN)
      : null;

  const withLegacy = (tracks: { lan: string }[]) => {
    // 旧全局偏移只给「本人没按轨设置过、众包也没有默认」的轨兜底
    if (legacy !== 0) {
      for (const t of tracks) {
        if (!ownLans.has(t.lan) && !crowdLans.has(t.lan)) {
          offsets[t.lan] = legacy;
        }
      }
    }
    return offsets;
  };

  try {
    const tracks = await fetchSubtitles(
      bvid,
      cid,
      getBiliSessdata(user.id) ?? undefined,
      duration,
    );
    const kept = dropOutclassedEnglish(tracks, repoTrack);
    const all = repoTrack ? [...kept, repoTrack] : kept;
    return Response.json({
      tracks: all,
      // 旧字段保留给老客户端;新客户端用 offsets 按轨查
      offsetMs: legacy,
      offsets: withLegacy(all),
    });
  } catch {
    const all = repoTrack ? [repoTrack] : [];
    return Response.json({
      tracks: all,
      offsetMs: legacy,
      offsets: withLegacy(all),
    });
  }
}
