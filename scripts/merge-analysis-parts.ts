// 把 scratch/analysis-parts/<courseId>.<part>.json 的碎片合并进 content/analysis/<courseId>.json。
//
// 为什么要分碎片：分析 agent 逐集写文件，中途撞上额度/超时就会留下只写了一半的成品文件，
// 直接覆盖会把已提交的完整版打残。让 agent 只写碎片、由本脚本统一合并，
// 最坏情况就是丢一个碎片，content/analysis/ 永远是完整的。
//
// 用法：npm run merge:analysis [-- --dry]

import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const ROOT = process.cwd();
const PARTS_DIR = path.join(ROOT, "scratch", "analysis-parts");
const OUT_DIR = path.join(ROOT, "content", "analysis");

interface KeyPoint {
  t?: number;
  title: string;
  detail?: string;
  formula?: string;
}
interface EpisodeAnalysis {
  n: number;
  summary: string;
  keyPoints: KeyPoint[];
  terms: { term: string; definition: string }[];
}

const dry = process.argv.includes("--dry");

/** 该集在课程 YAML 里存在吗，集号是否越界 */
function courseEpisodeNumbers(): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  const dir = path.join(ROOT, "content", "courses");
  const walk = (d: string): string[] =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(d, e.name);
      return e.isDirectory() ? walk(full) : /\.ya?ml$/.test(e.name) ? [full] : [];
    });
  for (const f of walk(dir)) {
    const c = parse(fs.readFileSync(f, "utf-8")) as {
      id: string;
      episodes?: { n: number }[];
    };
    out.set(c.id, new Set((c.episodes ?? []).map((e) => e.n)));
  }
  return out;
}

/** 时间戳自检：必须递增、非负；不合规就丢掉这一集，宁可缺也不要错的跳转 */
function checkEpisode(ep: EpisodeAnalysis): string | null {
  if (!Array.isArray(ep.keyPoints) || ep.keyPoints.length === 0) {
    return "没有 keyPoints";
  }
  let prev = -1;
  for (const kp of ep.keyPoints) {
    if (kp.t === undefined) continue;
    if (!Number.isFinite(kp.t) || kp.t < 0) return `t=${kp.t} 非法`;
    if (kp.t < prev) return `t 未递增（${prev} → ${kp.t}）`;
    prev = kp.t;
  }
  return null;
}

function main() {
  if (!fs.existsSync(PARTS_DIR)) {
    console.log(`没有 ${path.relative(ROOT, PARTS_DIR)}，无需合并`);
    return;
  }
  const epNums = courseEpisodeNumbers();

  // <courseId> → 碎片文件列表
  const byCourse = new Map<string, string[]>();
  for (const f of fs.readdirSync(PARTS_DIR)) {
    const m = f.match(/^(.+?)\.([^.]+)\.json$/);
    if (!m) continue;
    const list = byCourse.get(m[1]);
    if (list) list.push(f);
    else byCourse.set(m[1], [f]);
  }

  let touched = 0;
  for (const [courseId, files] of [...byCourse.entries()].sort()) {
    const target = path.join(OUT_DIR, `${courseId}.json`);
    if (!fs.existsSync(target)) {
      console.log(`✖ ${courseId}：没有已有的分析文件可合并，跳过`);
      continue;
    }
    const base = JSON.parse(fs.readFileSync(target, "utf-8"));
    const byN = new Map<number, EpisodeAnalysis>(
      base.episodes.map((e: EpisodeAnalysis) => [e.n, e]),
    );
    const valid = epNums.get(courseId) ?? new Set<number>();

    let added = 0;
    let rejected = 0;
    for (const f of files.sort()) {
      let parts: EpisodeAnalysis[];
      try {
        parts = JSON.parse(fs.readFileSync(path.join(PARTS_DIR, f), "utf-8"));
      } catch (e) {
        console.log(
          `  ✖ ${f}：JSON 解析失败（大概率是写到一半被打断），跳过 — ${
            e instanceof Error ? e.message.split("\n")[0] : e
          }`,
        );
        continue;
      }
      if (!Array.isArray(parts)) {
        console.log(`  ✖ ${f}：顶层不是数组，跳过`);
        continue;
      }
      for (const ep of parts) {
        if (!valid.has(ep.n)) {
          console.log(`  ✖ ${courseId} 第 ${ep.n} 集：课程里没有这一集，丢弃`);
          rejected++;
          continue;
        }
        const bad = checkEpisode(ep);
        if (bad) {
          console.log(`  ✖ ${courseId} 第 ${ep.n} 集：${bad}，丢弃`);
          rejected++;
          continue;
        }
        byN.set(ep.n, ep);
        added++;
      }
    }

    const episodes = [...byN.values()].sort((a, b) => a.n - b.n);
    const withT = episodes.filter((e) =>
      e.keyPoints.some((k) => typeof k.t === "number"),
    ).length;
    // 只要有集带时间戳，basis 就是 subtitles（没字幕的集保留为不带 t 的降级集）
    const merged = {
      ...base,
      basis: withT > 0 ? "subtitles" : base.basis,
      episodes,
    };

    if (!dry) {
      fs.writeFileSync(target, `${JSON.stringify(merged, null, 2)}\n`, "utf-8");
    }
    touched++;
    console.log(
      `${dry ? "[dry] " : ""}${courseId}：合入 ${added} 集` +
        `${rejected > 0 ? `（丢弃 ${rejected} 集）` : ""}，` +
        `共 ${episodes.length} 集、${withT} 集带时间轴`,
    );
  }

  console.log(`\n${dry ? "试运行" : "完成"}：更新 ${touched} 门课程`);
  if (!dry) console.log("接着跑 npm run validate 确认");
}

main();
