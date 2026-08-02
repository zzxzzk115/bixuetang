// 内容链接健康检查：B 站搬运稿件常被删除，笔记外链也会失效。
// 用法：
//   npm run check:links              # 检查全部课程
//   npm run check:links -- --bili    # 只查 B 站视频（快）
//   npm run check:links -- cs61a     # 只查指定课程
// 退出码非 0 表示有失效链接（可用于 CI 周期任务）。

import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const ROOT = path.join(process.cwd(), "content", "courses");
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Referer: "https://www.bilibili.com",
};

interface Course {
  id: string;
  title: string;
  sources?: { platform: string; url: string; uploader?: string }[];
  notes?: { title: string; url: string }[];
  episodes?: { n: number; title: string; bvid?: string }[];
}

interface Issue {
  course: string;
  kind: "video" | "note" | "site";
  url: string;
  detail: string;
}

function listYaml(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listYaml(full));
    else if (/\.ya?ml$/.test(e.name)) out.push(full);
  }
  return out;
}

/** B 站稿件是否仍然存在（code=0 存活；-404 稿件不存在；62002 已被删除/不可见） */
async function checkBili(url: string): Promise<string | null> {
  const bv = url.match(/\/video\/(BV[0-9A-Za-z]+)/)?.[1];
  const av = url.match(/\/video\/av(\d+)/)?.[1];
  if (!bv && !av) return null;
  const query = bv ? `bvid=${bv}` : `aid=${av}`;
  try {
    const res = await fetch(
      `https://api.bilibili.com/x/web-interface/view?${query}`,
      { headers: HEADERS },
    );
    const json = (await res.json()) as {
      code: number;
      message: string;
      data?: { title: string; pages: { page: number }[] };
    };
    if (json.code !== 0) return `稿件不可用（code=${json.code} ${json.message}）`;
    return null;
  } catch (e) {
    return `请求失败：${e instanceof Error ? e.message : String(e)}`;
  }
}

async function checkHttp(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": HEADERS["User-Agent"] },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status >= 400) return `HTTP ${res.status}`;
    return null;
  } catch (e) {
    return `不可达：${e instanceof Error ? e.message : String(e)}`;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const biliOnly = args.includes("--bili");
  const only = new Set(args.filter((a) => !a.startsWith("--")));

  const courses: Course[] = listYaml(ROOT).map(
    (f) => parse(fs.readFileSync(f, "utf-8")) as Course,
  );
  const targets = courses.filter((c) => only.size === 0 || only.has(c.id));

  const issues: Issue[] = [];
  let checked = 0;

  for (const course of targets) {
    for (const s of course.sources ?? []) {
      if (s.platform === "bilibili") {
        const problem = await checkBili(s.url);
        checked++;
        if (problem) {
          issues.push({ course: course.id, kind: "video", url: s.url, detail: problem });
          console.log(`✖ ${course.id} 视频源：${problem}`);
        }
        await new Promise((r) => setTimeout(r, 300));
      } else if (!biliOnly) {
        const problem = await checkHttp(s.url);
        checked++;
        if (problem) {
          issues.push({ course: course.id, kind: "site", url: s.url, detail: problem });
          console.log(`✖ ${course.id} 站点：${s.url} ${problem}`);
        }
      }
    }

    // 合集类课程：抽查前 3 集的独立稿件是否还在
    const sampled = (course.episodes ?? []).filter((e) => e.bvid).slice(0, 3);
    for (const ep of sampled) {
      const problem = await checkBili(`https://www.bilibili.com/video/${ep.bvid}`);
      checked++;
      if (problem) {
        issues.push({
          course: course.id,
          kind: "video",
          url: `第 ${ep.n} 集 ${ep.bvid}`,
          detail: problem,
        });
        console.log(`✖ ${course.id} 第 ${ep.n} 集：${problem}`);
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    if (!biliOnly) {
      for (const n of course.notes ?? []) {
        const problem = await checkHttp(n.url);
        checked++;
        if (problem) {
          issues.push({ course: course.id, kind: "note", url: n.url, detail: problem });
          console.log(`✖ ${course.id} 笔记：${n.url} ${problem}`);
        }
      }
    }
  }

  console.log(
    `\n体检完成：${targets.length} 门课程，检查 ${checked} 条链接，${issues.length} 条异常`,
  );
  if (issues.length > 0) {
    console.log("\n需要换源或修链接：");
    for (const i of issues) console.log(`  - [${i.course}] ${i.url} → ${i.detail}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
