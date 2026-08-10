import { NextRequest } from "next/server";
import { userIdFromBearer } from "@/lib/export/api-auth";
import { gatherExport } from "@/lib/export/gather";
import {
  bundleToJson,
  bundleToSingleMarkdown,
  termsToAnkiTsv,
} from "@/lib/export/format";

// 个人只读 API:GET /api/v1/export?format=json|md|anki
//   鉴权:Authorization: Bearer bxt_...(在 /export 页自助生成的个人令牌)
//   返回调用者本人的笔记/术语。无写操作。给 Zapier / n8n / 自建脚本用。

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = userIdFromBearer(req.headers.get("authorization"));
  if (!userId) {
    return Response.json(
      { error: "需要有效的 Bearer 令牌(在必学堂「导出与联动」页生成)" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }

  const format = req.nextUrl.searchParams.get("format") ?? "json";
  const bundle = gatherExport(userId);

  if (format === "md") {
    return new Response(bundleToSingleMarkdown(bundle), {
      headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  if (format === "anki") {
    return new Response(termsToAnkiTsv(bundle.terms), {
      headers: {
        "Content-Type": "text/tab-separated-values; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
  return Response.json(bundleToJson(bundle), { headers: { "Cache-Control": "no-store" } });
}
