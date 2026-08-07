// 从 YouTube 官方 CC 生成仓库字幕(bilibili 源无 CC 轨时的补充管线)。
//
//   npm run fetch:yt-subs -- <courseId> <playlistUrl> [--map 01:1,05:5] [--convert-only]
//
// 步骤:
//   1. 逐集核对 YouTube 与 bilibili 源(课程 YAML sources[0])的视频时长,
//      差 >3s 的集判定为不同剪辑版本,跳过——错的时间轴不如没有;
//   2. 对齐的集用 yt-dlp 抓人工 CC(没有人工轨退自动轨,标 ai);
//   3. 转换成 content/subtitles/<courseId>/<n>.json(播放器 CC 轨)
//      与 scratch/subtitles/<courseId>/<n>.txt(分析定时间戳用)。
//
// 抓取必须本地跑:YouTube/bilibili 都会拦数据中心 IP,放 CI 里是碰运气。
// CI 只负责校验产物(npm run validate 会查字幕 schema 与时间轴单调)。
// 依赖:yt-dlp(pip install yt-dlp),建议装 node 作 --js-runtimes。

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

const args = process.argv.slice(2);
const courseId = args[0];
const playlistUrl = args[1];
const mapArg = args.find((a) => a.startsWith("--map="))?.slice(6);
const convertOnly = args.includes("--convert-only");
if (!courseId || (!playlistUrl && !convertOnly)) {
  console.error(
    "用法: npm run fetch:yt-subs -- <courseId> <playlistUrl> [--map=01:1,05:5] [--convert-only]",
  );
  process.exit(2);
}

const ytDir = path.join("scratch", "yt-subs", courseId);
const outDir = path.join("content", "subtitles", courseId);
const digestDir = path.join("scratch", "subtitles", courseId);
fs.mkdirSync(ytDir, { recursive: true });

function findCourseYaml(): string {
  const root = path.join("content", "courses");
  for (const sub of fs.readdirSync(root)) {
    const p = path.join(root, sub, `${courseId}.yaml`);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`找不到课程 ${courseId} 的 YAML`);
}

function ytdlp(extra: string[]): string {
  return execFileSync(
    "yt-dlp",
    ["--js-runtimes", "node", ...extra],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

async function biliDurations(bvid: string): Promise<Map<number, number>> {
  const res = await fetch(
    `https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`,
    { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.bilibili.com" } },
  );
  const json = (await res.json()) as {
    data?: { page: number; duration: number }[];
  };
  return new Map((json.data ?? []).map((p) => [p.page, p.duration]));
}

function parseTime(t: string): number | null {
  const m = t.match(/(\d+):(\d+):(\d+)\.(\d+)/);
  if (!m) return null;
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

function parseVtt(file: string) {
  const raw = fs.readFileSync(file, "utf8");
  const isAuto = /Kind:\s*captions/i.test(raw) && /<c>/.test(raw);
  const cues: { from: number; to: number; text: string }[] = [];
  let prevTail = "";
  for (const block of raw.split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/).filter(Boolean);
    const ti = lines.findIndex((l) => l.includes("-->"));
    if (ti === -1) continue;
    const [f, t] = lines[ti].split("-->");
    const from = parseTime(f);
    const to = parseTime(t);
    if (from == null || to == null) continue;
    const textLines = lines.slice(ti + 1).map(stripTags).filter(Boolean);
    const text = textLines
      .filter((l) => !isAuto || l !== prevTail)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    prevTail = textLines.pop() ?? prevTail;
    if (!text) continue;
    const last = cues[cues.length - 1];
    if (last && last.text === text) {
      last.to = to;
      continue;
    }
    cues.push({ from: Math.round(from * 10) / 10, to: Math.round(to * 10) / 10, text });
  }
  return { cues, isAuto };
}

function convert(idx: string, n: number): boolean {
  const vtt = fs
    .readdirSync(ytDir)
    .find((f) => f.startsWith(idx + ".") && f.endsWith(".vtt"));
  if (!vtt) return false;
  const { cues, isAuto } = parseVtt(path.join(ytDir, vtt));
  if (cues.length < 10) return false;
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(digestDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, `${n}.json`),
    JSON.stringify(
      {
        lan: isAuto ? "yt-en-auto" : "yt-en",
        lanDoc: isAuto ? "English · 自动" : "English · 官方 CC",
        ai: isAuto,
        cues,
      },
      null,
      1,
    ),
  );
  const buckets = new Map<number, string>();
  for (const c of cues) {
    const b = Math.floor(c.from / 90) * 90;
    buckets.set(b, (buckets.get(b) ?? "") + " " + c.text);
  }
  let txt = `# 第 ${n} 集(YouTube CC${isAuto ? " 自动" : ""})\n# [mm:ss|秒数] 可作 keyPoints 的 t\n\n`;
  for (const [b, text] of [...buckets.entries()].sort((a, z) => a[0] - z[0])) {
    const mm = String(Math.floor(b / 60)).padStart(2, "0");
    const ss = String(b % 60).padStart(2, "0");
    txt += `[${mm}:${ss}|${b}s] ${text.trim().slice(0, 110)}\n`;
  }
  fs.writeFileSync(path.join(digestDir, `${n}.txt`), txt);
  console.log(`  ✔ 第 ${n} 集:${cues.length} 条 cue${isAuto ? "(自动轨)" : ""}`);
  return true;
}

async function main() {
  const yaml = YAML.parse(fs.readFileSync(findCourseYaml(), "utf8")) as {
    sources: { platform: string; url: string }[];
    episodes: { n: number }[];
  };

  // idx:n 映射(默认播放列表序号=集号)
  const pairs: [string, number][] = mapArg
    ? mapArg.split(",").map((s) => {
        const [i, n] = s.split(":");
        return [i.padStart(2, "0"), Number(n)];
      })
    : yaml.episodes.map((e) => [String(e.n).padStart(2, "0"), e.n]);

  if (!convertOnly) {
    // 1. 时长核对
    const bvid = yaml.sources
      .find((s) => s.platform === "bilibili")
      ?.url.match(/BV[0-9A-Za-z]+/)?.[0];
    if (!bvid) throw new Error("课程没有 bilibili 源,没法核对时长");
    console.log("==> 核对 YouTube 与 bilibili 时长");
    const ytOut = ytdlp([
      "--flat-playlist",
      "--print",
      "%(playlist_index)s|%(duration)s",
      playlistUrl,
    ]);
    const ytDur = new Map(
      ytOut
        .trim()
        .split("\n")
        .map((l) => l.split("|"))
        .map(([i, d]) => [i.padStart(2, "0"), Number(d)]),
    );
    const biliDur = await biliDurations(bvid);
    const aligned: [string, number][] = [];
    for (const [idx, n] of pairs) {
      const yt = ytDur.get(idx);
      const bili = biliDur.get(n);
      if (yt == null || bili == null) {
        console.log(`  - 第 ${n} 集:缺时长数据,跳过`);
        continue;
      }
      if (Math.abs(yt - bili) > 3) {
        console.log(`  ✗ 第 ${n} 集:YT ${yt}s vs bili ${bili}s,版本不同,跳过`);
        continue;
      }
      aligned.push([idx, n]);
    }
    console.log(`==> 对齐 ${aligned.length}/${pairs.length} 集,抓取 CC`);

    // 2. 抓人工轨;失败的集再试自动轨
    const items = aligned.map(([idx]) => Number(idx)).join(",");
    try {
      ytdlp([
        "--skip-download", "--write-subs", "--sub-langs", "en",
        "--sleep-subtitles", "2", "--playlist-items", items,
        "-o", path.join(ytDir, "%(playlist_index)02d.%(ext)s"), playlistUrl,
      ]);
    } catch { /* 部分失败继续,下面逐集补 */ }
    for (const [idx] of aligned) {
      const has = fs.readdirSync(ytDir).some((f) => f.startsWith(idx + "."));
      if (has) continue;
      try {
        ytdlp([
          "--skip-download", "--write-auto-subs", "--sub-langs", "en-orig",
          "--playlist-items", String(Number(idx)),
          "-o", path.join(ytDir, "%(playlist_index)02d.%(ext)s"), playlistUrl,
        ]);
      } catch {
        console.log(`  ✗ 第 ${Number(idx)} 集:人工/自动轨都抓不到`);
      }
    }
    pairs.length = 0;
    pairs.push(...aligned);
  }

  // 3. 转换
  console.log("==> 转换入库");
  let ok = 0;
  for (const [idx, n] of pairs) if (convert(idx, n)) ok++;
  console.log(`完成:${ok} 集写入 content/subtitles/${courseId}/;记得跑 npm run validate`);
}

void main();
