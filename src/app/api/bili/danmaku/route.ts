import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { fetchDanmaku } from "@/lib/bili/api";

// 弹幕：XML 在服务端解析成 JSON 再下发（省客户端解析 + 避开跨域）

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });

  const cid = Number(request.nextUrl.searchParams.get("cid"));
  if (!Number.isInteger(cid) || cid <= 0) {
    return Response.json({ error: "cid 不合法" }, { status: 400 });
  }
  try {
    const list = await fetchDanmaku(cid);
    // 弹幕量大，限个数防止拖垮客户端
    return Response.json({ danmaku: list.slice(0, 3000) });
  } catch {
    return Response.json({ danmaku: [] });
  }
}
