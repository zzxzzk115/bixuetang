import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getBiliSessdata } from "@/lib/bili/account";
import { fetchPlayUrl, fetchView } from "@/lib/bili/api";

// 解析播放地址：返回「经本站代理的」流地址。
// B 站直链要求 Referer，浏览器不能自定义，所以视频字节必须走 /api/bili/stream。
// 绑定了账号就带上凭据 → 拿得到高清晰度。

export const dynamic = "force-dynamic";

function proxied(url: string): string {
  return `/api/bili/stream?u=${encodeURIComponent(url)}`;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });

  const bvid = request.nextUrl.searchParams.get("bvid");
  const pageParam = Number(request.nextUrl.searchParams.get("page") ?? "1");
  if (!bvid || !/^BV[0-9A-Za-z]{8,}$/.test(bvid)) {
    return Response.json({ error: "bvid 不合法" }, { status: 400 });
  }
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const sessdata = getBiliSessdata(user.id) ?? undefined;

  try {
    const view = await fetchView(bvid, sessdata);
    const target =
      view.pages.find((p) => p.page === page) ?? view.pages[0] ?? null;
    if (!target) {
      return Response.json({ error: "该稿件没有可播放分P" }, { status: 404 });
    }
    const play = await fetchPlayUrl(bvid, target.cid, sessdata);

    // 选最高码率的一路视频 + 一路音频
    const video = [...play.video].sort(
      (a, b) => b.id - a.id || b.bandwidth - a.bandwidth,
    )[0];
    const audio = [...play.audio].sort((a, b) => b.bandwidth - a.bandwidth)[0];

    return Response.json({
      cid: target.cid,
      title: target.part,
      durationSec: play.durationSec || target.duration,
      bound: !!sessdata,
      qualityName: video ? (play.qualityNames[video.id] ?? "") : "",
      video: video ? proxied(video.url) : null,
      audio: audio ? proxied(audio.url) : null,
      progressive: play.progressive ? proxied(play.progressive.url) : null,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "解析失败" },
      { status: 502 },
    );
  }
}
