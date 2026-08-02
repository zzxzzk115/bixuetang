import type { NextRequest } from "next/server";
import { userFromAuthHeader } from "@/lib/auth/api-token";
import { resolveVideo } from "@/lib/content/video-index";

// 插件用：查询「当前视频属于哪门课的第几集」，不写任何进度。
// 供 popup 显示课程信息与徽标。

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(request: NextRequest) {
  const user = userFromAuthHeader(request.headers.get("authorization"));
  if (!user) {
    return Response.json({ error: "token 无效" }, { status: 401, headers: CORS });
  }
  const videoId = request.nextUrl.searchParams.get("videoId") ?? "";
  const pageRaw = request.nextUrl.searchParams.get("page");
  const page = pageRaw ? Number(pageRaw) : undefined;
  if (!videoId) {
    return Response.json({ error: "缺少 videoId" }, { status: 400, headers: CORS });
  }
  const hit = resolveVideo(videoId, Number.isFinite(page) ? page : undefined);
  return Response.json(
    { matched: !!hit, ...(hit ?? {}), user: user.displayName || user.username },
    { headers: CORS },
  );
}
