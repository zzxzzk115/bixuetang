import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { gatherExport } from "@/lib/export/gather";
import {
  bundleToJson,
  bundleToSingleMarkdown,
  bundleToZip,
  termsToAnkiTsv,
} from "@/lib/export/format";

// 个人数据导出:GET /api/export?format=zip|md|json|anki
//   zip  —— 每门课一个 Obsidian 友好 .md,打包(拖进库即用)
//   md   —— 合并成单个 Markdown
//   json —— 结构化,给通用消费
//   anki —— 卷宗术语 TSV,直接导入 Anki
// 仅本人(会话)可导出自己的数据。

export const dynamic = "force-dynamic";

function attach(filenameAscii: string, filenameUtf8: string): string {
  const enc = encodeURIComponent(filenameUtf8);
  return `attachment; filename="${filenameAscii}"; filename*=UTF-8''${enc}`;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("未登录", { status: 401 });

  const format = req.nextUrl.searchParams.get("format") ?? "zip";
  const bundle = gatherExport(user.id);

  switch (format) {
    case "zip": {
      const bytes = bundleToZip(bundle);
      // 转成干净的 ArrayBuffer 再当响应体(避开 Uint8Array 泛型与 BodyInit 的类型摩擦)
      const body = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      return new Response(body, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": attach("bixuetang-notes.zip", "必学堂笔记.zip"),
          "Cache-Control": "no-store",
        },
      });
    }
    case "md": {
      return new Response(bundleToSingleMarkdown(bundle), {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": attach("bixuetang-notes.md", "必学堂笔记.md"),
          "Cache-Control": "no-store",
        },
      });
    }
    case "json": {
      return new Response(JSON.stringify(bundleToJson(bundle), null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": attach("bixuetang-notes.json", "必学堂笔记.json"),
          "Cache-Control": "no-store",
        },
      });
    }
    case "anki": {
      return new Response(termsToAnkiTsv(bundle.terms), {
        headers: {
          "Content-Type": "text/tab-separated-values; charset=utf-8",
          "Content-Disposition": attach("bixuetang-anki.tsv", "必学堂术语-anki.tsv"),
          "Cache-Control": "no-store",
        },
      });
    }
    default:
      return new Response("未知格式", { status: 400 });
  }
}
