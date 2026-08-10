import "server-only";

import { type ExportBundle, fmtTime } from "./format";

// 把笔记推到用户自己的 Readwise / Notion。令牌是用户主动提供的、对其本人账号的令牌。
// 这里只负责「构造请求 + 发出去 + 回报结果」,存取令牌在 integration-actions.ts。

const NOTION_VERSION = "2022-06-28";

// ── Readwise ──────────────────────────────────────────────────────────
/** 校验 Readwise access token(readwise.io/access_token):有效返回 204 */
export async function validateReadwise(token: string): Promise<boolean> {
  try {
    const r = await fetch("https://readwise.io/api/v2/auth/", {
      headers: { Authorization: `Token ${token}` },
    });
    return r.status === 204;
  } catch {
    return false;
  }
}

/** 把笔记作为 highlights 推到 Readwise(按课程归组,带时间戳深链) */
export async function pushToReadwise(
  token: string,
  bundle: ExportBundle,
): Promise<{ ok: boolean; count: number; error?: string }> {
  const highlights = bundle.notes.map((n) => ({
    text: n.contentMd.trim() || "(空笔记)",
    title: `必学堂 · ${n.courseTitle}`,
    author: "必学堂",
    source_url: n.deepLink ?? undefined,
    source_type: "bixuetang",
    category: "articles",
    note: `第${n.episodeN}集 ${fmtTime(n.tSec)}`,
    highlighted_at: new Date(n.updatedAt).toISOString(),
  }));
  if (!highlights.length) return { ok: true, count: 0 };

  let count = 0;
  for (let i = 0; i < highlights.length; i += 100) {
    const batch = highlights.slice(i, i + 100);
    const r = await fetch("https://readwise.io/api/v2/highlights/", {
      method: "POST",
      headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ highlights: batch }),
    });
    if (!r.ok) return { ok: false, count, error: `Readwise 返回 ${r.status}` };
    count += batch.length;
  }
  return { ok: true, count };
}

// ── Notion(内部集成令牌 + 目标数据库,免 OAuth)────────────────────────
/** 校验 Notion 集成令牌(secret_...):有效返回 200 */
export async function validateNotion(token: string): Promise<boolean> {
  try {
    const r = await fetch("https://api.notion.com/v1/users/me", {
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION },
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** 每条笔记在目标数据库建一个页面(标题=课程·集·时间戳,正文=笔记,链接=深链) */
export async function pushToNotion(
  token: string,
  databaseId: string,
  bundle: ExportBundle,
): Promise<{ ok: boolean; count: number; error?: string }> {
  let count = 0;
  for (const n of bundle.notes) {
    const r = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties: {
          Name: {
            title: [
              {
                text: {
                  content: `${n.courseTitle} · 第${n.episodeN}集 ${fmtTime(n.tSec)}`,
                },
              },
            ],
          },
        },
        children: [
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: {
                    content: n.contentMd.slice(0, 1900) || "(空笔记)",
                    link: n.deepLink ? { url: n.deepLink } : null,
                  },
                },
              ],
            },
          },
        ],
      }),
    });
    if (!r.ok) return { ok: false, count, error: `Notion 返回 ${r.status}` };
    count++;
  }
  return { ok: true, count };
}
