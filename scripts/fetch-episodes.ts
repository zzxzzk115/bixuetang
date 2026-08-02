// 从 B 站拉取课程的真实分集标题，写回课程 YAML 的 episodes 字段。
// 用法：
//   npm run fetch:episodes            # 只处理还没有 episodes 的课程
//   npm run fetch:episodes -- --force # 重新拉取全部（覆盖已有 episodes）
//   npm run fetch:episodes -- cs61a games101   # 只处理指定课程 id
//
// B 站 view 接口的 data.pages[] 每项含 { page, part }，part 就是分 P 标题。

import fs from "node:fs";
import path from "node:path";
import { parseDocument, YAMLSeq } from "yaml";

const ROOT = path.join(process.cwd(), "content", "courses");
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Referer: "https://www.bilibili.com",
};

interface BiliPage {
  page: number;
  part: string;
}

interface EpisodeOut {
  n: number;
  title: string;
  /** 合集类课程：每集是独立稿件 */
  bvid?: string;
}

function listYaml(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listYaml(full));
    else if (/\.ya?ml$/.test(entry.name)) out.push(full);
  }
  return out;
}

interface SeasonEpisode {
  bvid: string;
  title: string;
  arc?: { title?: string };
}

interface BiliView {
  title: string;
  pages: BiliPage[];
  ugc_season?: {
    title: string;
    sections?: { episodes?: SeasonEpisode[] }[];
  };
}

async function fetchView(url: string): Promise<BiliView | null> {
  const bv = url.match(/\/video\/(BV[0-9A-Za-z]+)/)?.[1];
  const av = url.match(/\/video\/av(\d+)/)?.[1];
  if (!bv && !av) return null;
  const query = bv ? `bvid=${bv}` : `aid=${av}`;
  const res = await fetch(
    `https://api.bilibili.com/x/web-interface/view?${query}`,
    { headers: HEADERS },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as {
    code: number;
    message: string;
    data?: BiliView;
  };
  if (json.code !== 0) throw new Error(`bilibili code=${json.code} ${json.message}`);
  return json.data ?? null;
}

/** 清洗分 P 标题：去掉「P1」「01.」等与序号重复的前缀，压缩空白 */
function cleanPart(part: string, n: number): string {
  let t = part.replace(/\s+/g, " ").trim();
  t = t.replace(new RegExp(`^[Pp]${n}\\b[.、:：\\-\\s]*`), "");
  t = t.replace(new RegExp(`^0*${n}[.、:：]\\s*`), "");
  return t || `第 ${n} 讲`;
}

async function main() {
const args = process.argv.slice(2);
const force = args.includes("--force");
const only = new Set(args.filter((a) => !a.startsWith("--")));

const files = listYaml(ROOT);
let updated = 0;
let skipped = 0;
const problems: string[] = [];

for (const file of files) {
  const raw = fs.readFileSync(file, "utf-8");
  const doc = parseDocument(raw);
  const id = String(doc.get("id") ?? path.basename(file, path.extname(file)));
  if (only.size > 0 && !only.has(id)) continue;

  const hasEpisodes = doc.get("episodes") !== undefined;
  if (hasEpisodes && !force) {
    skipped++;
    continue;
  }

  const sources = doc.get("sources") as YAMLSeq | undefined;
  const biliUrl = sources?.items
    .map((s) => (s as { toJSON: () => { platform: string; url: string } }).toJSON())
    .find((s) => s.platform === "bilibili")?.url;
  if (!biliUrl) {
    skipped++;
    continue;
  }

  try {
    const view = await fetchView(biliUrl);
    if (!view) {
      problems.push(`${id}: 无法解析视频地址`);
      continue;
    }

    let episodes: EpisodeOut[];
    const seasonEps =
      view.ugc_season?.sections?.flatMap((s) => s.episodes ?? []) ?? [];

    if (view.pages.length > 1) {
      // 多分 P 稿件：p 参数即集数
      episodes = view.pages.map((p) => ({
        n: p.page,
        title: cleanPart(p.part, p.page),
      }));
    } else if (seasonEps.length > 1) {
      // 合集（ugc_season）：每集是独立稿件，必须记录各自 bvid
      episodes = seasonEps.map((e, i) => ({
        n: i + 1,
        title: cleanPart(e.title || e.arc?.title || "", i + 1),
        bvid: e.bvid,
      }));
      console.log(`  ↳ ${id}: 合集《${view.ugc_season?.title}》`);
    } else {
      problems.push(`${id}: 既非多分 P 也非合集（单集视频），保持原样`);
      continue;
    }

    doc.set("episodes", episodes);
    doc.delete("episodeCount");
    fs.writeFileSync(file, doc.toString({ lineWidth: 0 }), "utf-8");
    updated++;
    console.log(`✔ ${id}: ${episodes.length} 集（${episodes[0].title.slice(0, 30)}…）`);
  } catch (e) {
    problems.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 轻微限速，避免触发风控
  await new Promise((r) => setTimeout(r, 400));
}

console.log(`\n完成：更新 ${updated} 门，跳过 ${skipped} 门`);
if (problems.length > 0) {
  console.log(`\n需人工关注（${problems.length}）：`);
  for (const p of problems) console.log(`  - ${p}`);
}
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
