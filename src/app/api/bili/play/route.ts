import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getBiliSessdata } from "@/lib/bili/account";
import { fetchPlayUrl, fetchView } from "@/lib/bili/api";

// 解析播放地址：返回「经本站代理的」流地址。
// bilibili 直链要求 Referer，浏览器不能自定义，所以视频字节必须走 /api/bili/stream。
// 绑定了账号就带上凭据 → 拿得到高清晰度。

export const dynamic = "force-dynamic";

function proxied(url: string): string {
  return `/api/bili/stream?u=${encodeURIComponent(url)}`;
}

function streamUrl(request: NextRequest, url: string): string {
  const proto =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(":", "");
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    request.nextUrl.host;
  return new URL(proxied(url), `${proto}://${host}`).toString();
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

    // 同一清晰度 bilibili 会给 AVC / HEVC / AV1 三种编码。
    //
    // 挑码率最高的那一路是个陷阱：AV1 在 iPhone 上到 A17 Pro 才有硬解，
    // 之前的机型只能软解——表现就是「解码特别慢」，画面卡成幻灯片。
    // AVC(H.264) 是唯一在所有设备上都硬解的编码，同画质码率高一些，
    // 但流畅度比省那点流量重要得多。
    const qualities = play.video.map((stream) => ({
      id: stream.id,
      name: play.qualityNames[stream.id] ?? String(stream.id),
      url: streamUrl(request, stream.url),
    }));
    const single =
      qualities[0]?.url ??
      (play.progressive ? streamUrl(request, play.progressive.url) : null);
    return Response.json({
      aid: view.aid,
      cid: target.cid,
      title: target.part,
      durationSec: play.durationSec || target.duration,
      bound: !!sessdata,
      qualities,
      qualityName: qualities[0]?.name ?? (sessdata ? "高清 720P" : "标清"),
      video: single,
      audio: null,
      progressive: single,
      dashManifest: null,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "解析失败" },
      { status: 502 },
    );
  }
}
