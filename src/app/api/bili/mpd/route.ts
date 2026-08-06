import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getBiliSessdata } from "@/lib/bili/account";
import { fetchDashPlayUrl, fetchView } from "@/lib/bili/api";
import { buildMpd } from "@/lib/bili/mpd";

// 合成 DASH manifest。每次请求都现取播放地址——bilibili 直链约 2 小时过期，
// dash.js 播放中途出错会重拉 MPD，这里必须每次都给新鲜直链。
// BaseURL 用相对路径（/api/bili/stream?u=...），dash.js 会相对 MPD 地址解析，
// 天然同源，不用拼 x-forwarded 绝对地址。

export const dynamic = "force-dynamic";

function proxied(url: string): string {
  return `/api/bili/stream?u=${encodeURIComponent(url)}`;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("请先登录", { status: 401 });

  const bvid = request.nextUrl.searchParams.get("bvid");
  const pageParam = Number(request.nextUrl.searchParams.get("page") ?? "1");
  if (!bvid || !/^BV[0-9A-Za-z]{8,}$/.test(bvid)) {
    return new Response("bvid 不合法", { status: 400 });
  }
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const sessdata = getBiliSessdata(user.id) ?? undefined;

  try {
    const view = await fetchView(bvid, sessdata);
    const target =
      view.pages.find((p) => p.page === page) ?? view.pages[0] ?? null;
    if (!target) return new Response("该稿件没有可播放分P", { status: 404 });

    const dash = await fetchDashPlayUrl(bvid, target.cid, sessdata);
    const mpd = dash
      ? buildMpd(
          {
            durationSec: dash.durationSec || target.duration,
            video: dash.video,
            audio: dash.audio,
          },
          proxied,
        )
      : null;
    if (!mpd) return new Response("该视频没有可用的 DASH 流", { status: 404 });

    return new Response(mpd, {
      headers: {
        "content-type": "application/dash+xml",
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "解析失败",
      { status: 502 },
    );
  }
}
