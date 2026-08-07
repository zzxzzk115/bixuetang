import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getBiliSessdata } from "@/lib/bili/account";
import { biliHeaders, fetchView } from "@/lib/bili/api";

// 视频封面代理。分享卡要把封面画进 canvas,跨域图会污染画布导出不了,
// 所以走同源代理;封面不变,给长缓存。

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("请先登录", { status: 401 });

  const bvid = request.nextUrl.searchParams.get("bvid");
  if (!bvid || !/^BV[0-9A-Za-z]{8,}$/.test(bvid)) {
    return new Response("bvid 不合法", { status: 400 });
  }
  const sessdata = getBiliSessdata(user.id) ?? undefined;

  try {
    const view = await fetchView(bvid, sessdata);
    const pic = view.pic;
    if (!pic) return new Response("没有封面", { status: 404 });
    const url = pic.startsWith("//") ? `https:${pic}` : pic;
    const upstream = await fetch(url, {
      headers: biliHeaders(),
      cache: "no-store",
    });
    if (!upstream.ok || !upstream.body) {
      return new Response("封面获取失败", { status: 502 });
    }
    return new Response(upstream.body, {
      headers: {
        "content-type":
          upstream.headers.get("content-type") ?? "image/jpeg",
        "cache-control": "private, max-age=86400",
      },
    });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "封面获取失败",
      { status: 502 },
    );
  }
}
