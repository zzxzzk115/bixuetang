// 抓取 B 站 CC 字幕（带时间轴），供 AI 分析生成精确的知识点时间戳。
//
// 前置：B 站游客态拿不到字幕列表，需要登录后的 SESSDATA。
//   1. 浏览器登录 bilibili.com
//   2. F12 → Application → Cookies → https://www.bilibili.com → 复制 SESSDATA 的值
//   3. 在项目根目录建 .env.local（已 gitignore），写入：
//        BILI_SESSDATA=你复制的值
//   SESSDATA 等同于账号登录态，切勿提交或分享。撤销方法：B 站「设置 → 安全 → 退出所有设备」。
//
// 用法：
//   npm run fetch:subtitles -- <courseId> [起始集] [结束集]
//   例：npm run fetch:subtitles -- games101 1 22
// 产物：scratch/subtitles/<courseId>/<n>.json（不入 git，供 /analyze-course 技能读取）

import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const ROOT = process.cwd();
const OUT_ROOT = path.join(ROOT, "scratch", "subtitles");

function loadEnvLocal(): void {
  const file = path.join(ROOT, ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

interface Course {
  id: string;
  title: string;
  sources: { platform: string; url: string }[];
  episodes: { n: number; title: string; bvid?: string }[];
}

function findCourse(id: string): { course: Course; file: string } {
  const dir = path.join(ROOT, "content", "courses");
  const walk = (d: string): string[] =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(d, e.name);
      return e.isDirectory() ? walk(full) : /\.ya?ml$/.test(e.name) ? [full] : [];
    });
  for (const file of walk(dir)) {
    const course = parse(fs.readFileSync(file, "utf-8")) as Course;
    if (course.id === id) return { course, file };
  }
  throw new Error(`找不到课程 ${id}`);
}

function headers(): Record<string, string> {
  const sessdata = process.env.BILI_SESSDATA;
  const h: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    Referer: "https://www.bilibili.com",
  };
  if (sessdata) h.Cookie = `SESSDATA=${sessdata}`;
  return h;
}

interface SubtitleLine {
  from: number;
  to: number;
  content: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return (await res.json()) as T;
}

/** 取某个稿件某一分 P 的字幕行 */
async function fetchSubtitle(
  bvid: string,
  cid: number,
): Promise<{ lang: string; lines: SubtitleLine[] } | null> {
  const player = await getJson<{
    code: number;
    data?: { subtitle?: { subtitles?: { lan: string; subtitle_url: string }[] } };
  }>(`https://api.bilibili.com/x/player/wbi/v2?bvid=${bvid}&cid=${cid}`);
  const list = player.data?.subtitle?.subtitles ?? [];
  if (list.length === 0) return null;

  // 优先人工中文 > AI 中文 > 英文
  const pick =
    list.find((s) => /^zh-(CN|Hans)$/i.test(s.lan)) ??
    list.find((s) => /^ai-zh/i.test(s.lan)) ??
    list.find((s) => /^(en|ai-en)/i.test(s.lan)) ??
    list[0];

  const url = pick.subtitle_url.startsWith("//")
    ? `https:${pick.subtitle_url}`
    : pick.subtitle_url;
  const body = await getJson<{ body: SubtitleLine[] }>(url);
  return { lang: pick.lan, lines: body.body ?? [] };
}

async function main() {
  loadEnvLocal();
  const [courseId, fromRaw, toRaw] = process.argv.slice(2);
  if (!courseId) {
    console.error("用法：npm run fetch:subtitles -- <courseId> [起始集] [结束集]");
    process.exit(1);
  }
  if (!process.env.BILI_SESSDATA) {
    console.error(
      "缺少 BILI_SESSDATA。请在项目根目录建 .env.local 写入 BILI_SESSDATA=<你的 SESSDATA>，\n" +
        "获取方式见本脚本顶部注释。（游客态拿不到 CC 字幕列表）",
    );
    process.exit(1);
  }

  const { course } = findCourse(courseId);
  const from = fromRaw ? Number(fromRaw) : 1;
  const to = toRaw ? Number(toRaw) : course.episodes.length;
  const targets = course.episodes.filter((e) => e.n >= from && e.n <= to);

  const mainBv = course.sources
    .find((s) => s.platform === "bilibili")
    ?.url.match(/\/video\/(BV[0-9A-Za-z]+)/)?.[1];

  const outDir = path.join(OUT_ROOT, courseId);
  fs.mkdirSync(outDir, { recursive: true });

  // 多分 P 课程：一次拿整份 pages 拿到每 P 的 cid
  let pages: { cid: number; page: number }[] = [];
  if (mainBv) {
    const view = await getJson<{ data?: { pages: { cid: number; page: number }[] } }>(
      `https://api.bilibili.com/x/web-interface/view?bvid=${mainBv}`,
    );
    pages = view.data?.pages ?? [];
  }

  let ok = 0;
  let empty = 0;
  for (const ep of targets) {
    try {
      let bvid: string | undefined;
      let cid: number | undefined;

      if (ep.bvid) {
        // 合集课程：每集是独立稿件，需单独取 cid
        bvid = ep.bvid;
        const view = await getJson<{ data?: { pages: { cid: number }[] } }>(
          `https://api.bilibili.com/x/web-interface/view?bvid=${ep.bvid}`,
        );
        cid = view.data?.pages?.[0]?.cid;
      } else {
        bvid = mainBv;
        cid = pages.find((p) => p.page === ep.n)?.cid;
      }

      if (!bvid || !cid) {
        console.log(`- 第 ${ep.n} 集：拿不到 cid，跳过`);
        continue;
      }

      const sub = await fetchSubtitle(bvid, cid);
      if (!sub || sub.lines.length === 0) {
        empty++;
        console.log(`- 第 ${ep.n} 集：无 CC 字幕`);
      } else {
        fs.writeFileSync(
          path.join(outDir, `${ep.n}.json`),
          JSON.stringify(
            { n: ep.n, title: ep.title, lang: sub.lang, lines: sub.lines },
            null,
            0,
          ),
          "utf-8",
        );
        ok++;
        console.log(`✔ 第 ${ep.n} 集：${sub.lines.length} 行（${sub.lang}）`);
      }
    } catch (e) {
      console.log(`✖ 第 ${ep.n} 集：${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, 500)); // 限速，避免风控
  }

  console.log(
    `\n${courseId}：${ok} 集有字幕，${empty} 集无字幕 → ${path.relative(ROOT, outDir)}`,
  );
  if (ok === 0) {
    console.log(
      "一集都没抓到，可能是：SESSDATA 已失效、该搬运源本就没传 CC 字幕（很常见），\n" +
        "或视频只有内嵌硬字幕（无法通过接口获取）。",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
