import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { biliHeaders } from "@/lib/bili/api";

// 视频字节代理：补上 B 站要求的 Referer/UA，并透传 Range（拖动进度条要用）。
// 只允许代理 B 站 CDN 域名，避免变成任意 URL 的开放代理。

export const dynamic = "force-dynamic";

const ALLOWED_HOST = /(^|\.)(bilivideo\.com|bilivideo\.cn|akamaized\.net|bilibili\.com)$/;

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("请先登录", { status: 401 });

  const raw = request.nextUrl.searchParams.get("u");
  if (!raw) return new Response("缺少地址", { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response("地址不合法", { status: 400 });
  }
  if (target.protocol !== "https:" || !ALLOWED_HOST.test(target.hostname)) {
    return new Response("只允许代理 B 站视频源", { status: 403 });
  }

  const headers = biliHeaders();
  const range = request.headers.get("range");
  if (range) headers.Range = range;

  const upstream = await fetch(target, { headers, cache: "no-store" });
  const out = new Headers();
  for (const key of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
  ]) {
    const value = upstream.headers.get(key);
    if (value) out.set(key, value);
  }
  // 流是私有内容，别让中间层缓存
  out.set("cache-control", "private, no-store");
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
