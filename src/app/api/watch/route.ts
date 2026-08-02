import type { NextRequest } from "next/server";
import { z } from "zod";
import { userFromAuthHeader } from "@/lib/auth/api-token";
import { recordWatch, WATCH_THRESHOLD } from "@/lib/progress/watch";

// 浏览器插件上报观看进度。
// 鉴权：Authorization: Bearer <token>（在 /settings 生成）。
// 插件是跨源请求，需要 CORS 允许。

const BodySchema = z.object({
  videoId: z.string().min(2).max(64),
  page: z.number().int().positive().optional(),
  ratio: z.number().min(0).max(1).optional(),
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request: NextRequest) {
  const user = userFromAuthHeader(request.headers.get("authorization"));
  if (!user) {
    return Response.json(
      { error: "token 无效或已撤销" },
      { status: 401, headers: CORS },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400, headers: CORS });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: "参数错误", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400, headers: CORS },
    );
  }

  const outcome = recordWatch(user.id, parsed.data);
  return Response.json({ ...outcome, threshold: WATCH_THRESHOLD }, { headers: CORS });
}
