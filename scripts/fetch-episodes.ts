// 从 bilibili 拉取课程的原稿标题与真实分集标题，写回课程 YAML。
// 用法：
//   npm run fetch:episodes                  # 补原标题；仅为缺少 episodes 的课程补分集
//   npm run fetch:episodes -- --titles-only # 只刷新原稿标题，不改分集
//   npm run fetch:episodes -- --force       # 刷新原标题并覆盖已有分集
//   npm run fetch:episodes -- cs61a games101
//
// bilibili view 接口的 data.title 是原稿标题，data.pages[].part 是分 P 标题。

import fs from "node:fs";
import path from "node:path";
import { parseDocument, YAMLMap, YAMLSeq } from "yaml";

const ROOT = path.join(process.cwd(), "content", "courses");
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Referer: "https://www.bilibili.com",
};

interface BiliPage {
  page: number;
  part: string;
  /** 分 P 时长（秒） */
  duration?: number;
}

interface EpisodeOut {
  n: number;
  title: string;
  /** 合集类课程：每集是独立稿件 */
  bvid?: string;
  /** 视频时长（秒）——XP 按时长计分 */
  durationSec?: number;
}

interface SeasonEpisode {
  bvid: string;
  title: string;
  arc?: { title?: string; duration?: number };
}

interface BiliView {
  title: string;
  pages: BiliPage[];
  ugc_season?: {
    title: string;
    sections?: { episodes?: SeasonEpisode[] }[];
  };
}

interface SourceOut {
  platform: string;
  url: string;
  title?: string;
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
  if (json.code !== 0) {
    throw new Error(`bilibili code=${json.code} ${json.message}`);
  }
  return json.data ?? null;
}

/** 清洗分 P 标题：去掉「P1」「01.」等与序号重复的前缀，压缩空白 */
function cleanPart(part: string, n: number): string {
  let title = part.replace(/\s+/g, " ").trim();
  title = title.replace(new RegExp(`^[Pp]${n}\\b[.、:：\\-\\s]*`), "");
  title = title.replace(new RegExp(`^0*${n}[.、:：]\\s*`), "");
  return title || `第 ${n} 讲`;
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const titlesOnly = args.includes("--titles-only");
  const only = new Set(args.filter((arg) => !arg.startsWith("--")));

  const files = listYaml(ROOT);
  let titleUpdates = 0;
  let episodeUpdates = 0;
  let skipped = 0;
  const problems: string[] = [];

  for (const file of files) {
    const raw = fs.readFileSync(file, "utf-8");
    const doc = parseDocument(raw);
    const id = String(doc.get("id") ?? path.basename(file, path.extname(file)));
    if (only.size > 0 && !only.has(id)) continue;

    const sources = doc.get("sources", true) as YAMLSeq | undefined;
    const sourceData =
      sources?.items.map((source) =>
        (source as { toJSON: () => SourceOut }).toJSON(),
      ) ?? [];
    const biliIndexes = sourceData.flatMap((source, index) =>
      source.platform === "bilibili" ? [index] : [],
    );
    if (biliIndexes.length === 0 || !sources) {
      skipped++;
      continue;
    }

    let dirty = false;
    let primaryView: BiliView | null = null;

    for (const biliIndex of biliIndexes) {
      const biliSource = sourceData[biliIndex];
      try {
        const view = await fetchView(biliSource.url);
        if (!view) {
          problems.push(`${id} 来源 ${biliIndex + 1}: 无法解析视频地址`);
          continue;
        }
        if (biliIndex === biliIndexes[0]) primaryView = view;

        const originalTitle = view.title.replace(/\s+/g, " ").trim();
        if (originalTitle && originalTitle !== biliSource.title) {
          const sourceNode = sources.items[biliIndex];
          if (sourceNode instanceof YAMLMap) {
            sourceNode.set("title", originalTitle);
            titleUpdates++;
            dirty = true;
          }
        }
      } catch (error) {
        problems.push(
          `${id} 来源 ${biliIndex + 1}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      // 每个稿件之间轻微限速，避免触发平台风控。
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const hasEpisodes = doc.get("episodes") !== undefined;
    if (primaryView && !titlesOnly && (force || !hasEpisodes)) {
      const seasonEpisodes =
        primaryView.ugc_season?.sections?.flatMap(
          (section) => section.episodes ?? [],
        ) ?? [];
      let episodes: EpisodeOut[] | undefined;

      if (primaryView.pages.length > 1) {
        episodes = primaryView.pages.map((page) => ({
          n: page.page,
          title: cleanPart(page.part, page.page),
          durationSec: page.duration,
        }));
      } else if (seasonEpisodes.length > 1) {
        episodes = seasonEpisodes.map((episode, index) => ({
          n: index + 1,
          title: cleanPart(
            episode.title || episode.arc?.title || "",
            index + 1,
          ),
          bvid: episode.bvid,
          durationSec: episode.arc?.duration,
        }));
        console.log(`  ↳ ${id}: 合集《${primaryView.ugc_season?.title}》`);
      }

      if (episodes) {
        doc.set("episodes", episodes);
        doc.delete("episodeCount");
        episodeUpdates++;
        dirty = true;
        console.log(
          `✔ ${id}: ${episodes.length} 集（${episodes[0].title.slice(0, 30)}…）`,
        );
      } else if (!hasEpisodes) {
        problems.push(
          `${id}: 既非多分 P 也非合集（单集视频），仅写入原稿标题`,
        );
      }
    }

    if (dirty) {
      fs.writeFileSync(file, doc.toString({ lineWidth: 0 }), "utf-8");
    }
  }

  console.log(
    `\n完成：原标题更新 ${titleUpdates} 个，分集更新 ${episodeUpdates} 门，跳过 ${skipped} 门`,
  );
  if (problems.length > 0) {
    console.log(`\n需人工关注（${problems.length}）：`);
    for (const problem of problems) console.log(`  - ${problem}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
