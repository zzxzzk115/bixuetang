import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { biliHeaders } from "@/lib/bili/api";

// 视频字节代理：补上 bilibili 要求的 Referer/UA，并透传 Range（拖动进度条要用）。
// 只允许代理 bilibili CDN 域名，避免变成任意 URL 的开放代理。

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
    return new Response("只允许代理 bilibili 视频源", { status: 403 });
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
  // 上游支持 Range（实测发 Range 会返回 206 + content-range），
  // 但它**不吐 Accept-Ranges 头**。浏览器看不到这个声明就不敢发 Range：
  // 只能从头把整个文件拉完才开始播，也没法拖进度条。
  // CS50 第一集 224MB，表现就是点了播放一直黑屏；小文件熬一会儿能出来，
  // 第二次走浏览器缓存又「好了」——症状全对得上。这里替上游把话说明白。
  out.set("accept-ranges", "bytes");
  // 流是私有内容，别让中间层缓存
  out.set("cache-control", "private, no-store");
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
