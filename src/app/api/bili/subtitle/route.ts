import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getBiliSessdata } from "@/lib/bili/account";
import { fetchSubtitles } from "@/lib/bili/api";

// CC 字幕：服务端拉取并转成 JSON 下发（字幕源要 Referer，且多数需登录态）

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

  try {
    const tracks = await fetchSubtitles(
      bvid,
      cid,
      getBiliSessdata(user.id) ?? undefined,
      duration,
    );
    return Response.json({ tracks });
  } catch {
    return Response.json({ tracks: [] });
  }
}
