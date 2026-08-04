// 抓取 bilibili CC 字幕（带时间轴），供 AI 分析生成精确的知识点时间戳。
//
// 前置：bilibili 游客态拿不到字幕列表，需要登录后的 SESSDATA。
//   1. 浏览器登录 bilibili.com
//   2. F12 → Application → Cookies → https://www.bilibili.com → 复制 SESSDATA 的值
//   3. 在项目根目录建 .env.local（已 gitignore），写入：
//        BILI_SESSDATA=你复制的值
//   SESSDATA 等同于账号登录态，切勿提交或分享。撤销方法：bilibili 「设置 → 安全 → 退出所有设备」。
//
// 用法：
//   npm run fetch:subtitles -- <courseId> [起始集] [结束集]
//   例：npm run fetch:subtitles -- games101 1 22
//   npm run fetch:subtitles -- --probe    # 普查：每门课抽 1 集，报告哪些课有 CC 字幕
// 产物（均在 scratch/ 下，不入 git，供 /analyze-course 技能读取）：
//   scratch/subtitles/<courseId>/<n>.json  原始字幕行（带精确 from/to）
//   scratch/subtitles/<courseId>/<n>.txt   按 60 秒聚合并截断的摘要，形如「[03:00|180s] 这一分钟说的话……」
// 分析时读 .txt 就够：体量约为 JSON 的 1/25，时间戳精度（±60 秒）对知识点定位完全够用。

import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const ROOT = process.cwd();
const OUT_ROOT = path.join(ROOT, "scratch", "subtitles");

// 摘要粒度：时间戳精度 ±90 秒，每桶留 100 字。
// 这两个数是拿整课体量倒推的——一门 25 集的课摘要总量要能塞进单个分析 agent 的上下文，
// 同时 90 秒精度足够让用户点时间戳跳到「大致在讲这个」的位置。
const DIGEST_BUCKET = 90;
const DIGEST_CHARS = 100;

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

function allCourses(): Course[] {
  const dir = path.join(ROOT, "content", "courses");
  const walk = (d: string): string[] =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(d, e.name);
      return e.isDirectory() ? walk(full) : /\.ya?ml$/.test(e.name) ? [full] : [];
    });
  return walk(dir).map((f) => parse(fs.readFileSync(f, "utf-8")) as Course);
}

function findCourse(id: string): Course {
  const course = allCourses().find((c) => c.id === id);
  if (!course) throw new Error(`找不到课程 ${id}`);
  return course;
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

/** 解出某集对应的 (bvid, cid)；合集课每集是独立稿件，多 P 课共用一个 bvid */
async function resolveEpisode(
  course: Course,
  n: number,
  mainBv: string | undefined,
  pages: { cid: number; page: number }[],
): Promise<{ bvid: string; cid: number } | null> {
  const ep = course.episodes.find((e) => e.n === n);
  if (!ep) return null;
  if (ep.bvid) {
    const view = await getJson<{ data?: { pages: { cid: number }[] } }>(
      `https://api.bilibili.com/x/web-interface/view?bvid=${ep.bvid}`,
    );
    const cid = view.data?.pages?.[0]?.cid;
    return cid ? { bvid: ep.bvid, cid } : null;
  }
  const cid = pages.find((p) => p.page === n)?.cid;
  return mainBv && cid ? { bvid: mainBv, cid } : null;
}

/**
 * 把字幕行按 60 秒一桶聚合成「[mm:ss] 文本」，喂给 AI 分析用。
 * 每桶截断到 maxChars——bilibili AI 字幕是无标点的 ASR 流，「这个这个这个」这类口水话占了大半，
 * 每分钟开头一两句足够判断在讲什么。截断后整课体量能塞进单个 agent 的上下文。
 * 需要逐字原文时读同目录的 .json。
 */
function digest(
  lines: SubtitleLine[],
  bucketSeconds = DIGEST_BUCKET,
  maxChars = DIGEST_CHARS,
): string {
  const buckets = new Map<number, string[]>();
  for (const l of lines) {
    const k = Math.floor(l.from / bucketSeconds);
    const arr = buckets.get(k);
    if (arr) arr.push(l.content);
    else buckets.set(k, [l.content]);
  }
  const fmt = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, texts]) => {
      const t = k * bucketSeconds;
      // 中文字幕逐句之间不加空格，英文加——避免把英文单词粘连
      const joined = texts.join(/[一-龥]/.test(texts[0] ?? "") ? "" : " ");
      const body =
        joined.length > maxChars ? `${joined.slice(0, maxChars)}…` : joined;
      return `[${fmt(t)}|${t}s] ${body}`;
    })
    .join("\n");
}

function mainBvOf(course: Course): string | undefined {
  return course.sources
    ?.find((s) => s.platform === "bilibili")
    ?.url.match(/\/video\/(BV[0-9A-Za-z]+)/)?.[1];
}

/** 普查：每门有 bilibili 源的课抽第 1 集，看有没有 CC 字幕，输出可批量分析的课程清单 */
async function probe() {
  const courses = allCourses().filter(
    (c) => mainBvOf(c) && (c.episodes?.length ?? 0) > 0,
  );
  console.log(`普查 ${courses.length} 门有 bilibili 源且有分集清单的课程……\n`);

  const withSub: string[] = [];
  const without: string[] = [];

  for (const course of courses) {
    const mainBv = mainBvOf(course);
    try {
      let pages: { cid: number; page: number }[] = [];
      if (mainBv) {
        const view = await getJson<{
          data?: { pages: { cid: number; page: number }[] };
        }>(`https://api.bilibili.com/x/web-interface/view?bvid=${mainBv}`);
        pages = view.data?.pages ?? [];
      }
      const first = course.episodes[0].n;
      const target = await resolveEpisode(course, first, mainBv, pages);
      if (!target) {
        without.push(`${course.id}（拿不到 cid）`);
        console.log(`- ${course.id}：拿不到 cid`);
      } else {
        const sub = await fetchSubtitle(target.bvid, target.cid);
        if (sub && sub.lines.length > 0) {
          withSub.push(course.id);
          console.log(
            `✔ ${course.id}：${sub.lines.length} 行（${sub.lang}）× ${course.episodes.length} 集`,
          );
        } else {
          without.push(course.id);
          console.log(`- ${course.id}：无 CC 字幕`);
        }
      }
    } catch (e) {
      without.push(`${course.id}（${e instanceof Error ? e.message : e}）`);
      console.log(`✖ ${course.id}：${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, 400)); // 限速，避免风控
  }

  console.log(
    `\n有 CC 字幕：${withSub.length} 门 / 无字幕：${without.length} 门\n`,
  );
  console.log("可抓字幕的课程 id：");
  console.log(withSub.join(" "));
}

async function main() {
  loadEnvLocal();
  const [courseId, fromRaw, toRaw] = process.argv.slice(2);
  if (courseId === "--probe") {
    if (!process.env.BILI_SESSDATA) {
      console.error("缺少 BILI_SESSDATA，见本脚本顶部注释。");
      process.exit(1);
    }
    await probe();
    return;
  }
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

  const course = findCourse(courseId);
  const from = fromRaw ? Number(fromRaw) : 1;
  const to = toRaw ? Number(toRaw) : course.episodes.length;
  const targets = course.episodes.filter((e) => e.n >= from && e.n <= to);

  const mainBv = mainBvOf(course);

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
      const target = await resolveEpisode(course, ep.n, mainBv, pages);
      if (!target) {
        console.log(`- 第 ${ep.n} 集：拿不到 cid，跳过`);
        continue;
      }

      const sub = await fetchSubtitle(target.bvid, target.cid);
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
        fs.writeFileSync(
          path.join(outDir, `${ep.n}.txt`),
          `# 第 ${ep.n} 集 ${ep.title}（${sub.lang}）\n` +
            `# 每行格式：[mm:ss|秒数] 该分钟的字幕文本；秒数可直接用作 keyPoints 的 t\n\n` +
            digest(sub.lines),
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
