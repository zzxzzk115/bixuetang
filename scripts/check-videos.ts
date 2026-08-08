/**
 * 视频失效探活:扫全站课程的 bilibili 稿件,主动发现哪些已下架/失效、该补备源。
 * 和播放器的多 bvid 容错(source.mirrors / episode.mirrors)是一套 —— 这里离线
 * 先发现,运营据此补 mirror,用户就不用等着点「视频不见了」。
 *
 *   npm run check:videos            # 探活并打印报告 + 写台账 scratch/video-health.md
 *   npm run check:videos -- --json  # 额外输出机读 JSON
 *
 * 需要 .env.local 的 BILI_SESSDATA(游客态部分接口会被风控)。请求是串行 + 限速的,
 * 全站几百个稿件要跑几分钟,别并发轰接口。
 */
import fs from "node:fs";
import path from "node:path";
import { loadContent } from "../src/lib/content/load";
import type { Course } from "../src/lib/content/schema";

function loadEnv() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const l of fs.readFileSync(p, "utf-8").split("\n")) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]])
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const H = () => ({
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36",
  Referer: "https://www.bilibili.com",
  Cookie: process.env.BILI_SESSDATA
    ? `SESSDATA=${process.env.BILI_SESSDATA}`
    : "",
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function bvidOf(url: string): string | null {
  return url.match(/\/video\/(BV[0-9A-Za-z]+)/)?.[1] ?? null;
}

type Health = { alive: boolean; code: number; message: string };

/** 探一个稿件是否可见。-412 是风控限速,退避重试;其余非 0 视为失效。 */
async function probe(bvid: string): Promise<Health> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(
        `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
        { headers: H() },
      );
      const j = (await r.json()) as {
        code?: number;
        message?: string;
        data?: { bvid?: string };
      };
      const code = j.code ?? -1;
      if (code === -412 || code === -509) {
        // 被限速:指数退避后重试
        await sleep(3000 * (attempt + 1));
        continue;
      }
      return { alive: code === 0, code, message: j.message ?? "" };
    } catch (e) {
      await sleep(2000 * (attempt + 1));
      if (attempt === 3)
        return {
          alive: false,
          code: -1,
          message: e instanceof Error ? e.message : "网络错误",
        };
    }
  }
  return { alive: false, code: -412, message: "持续被限速,未能判定" };
}

/** 收集一门课的所有待探稿件:多分 P 课看主源+source.mirrors,合集课逐集 bvid+mirrors。 */
function collectBvids(
  course: Course,
): { label: string; primary: string; mirrors: string[] }[] {
  const bili = course.sources.find((s) => s.platform === "bilibili");
  if (!bili) return [];
  const out: { label: string; primary: string; mirrors: string[] }[] = [];
  const collection = course.episodes.some((e) => e.bvid);
  if (collection) {
    for (const ep of course.episodes) {
      if (!ep.bvid) continue;
      out.push({
        label: `第${ep.n}集 ${ep.title}`,
        primary: ep.bvid,
        mirrors: ep.mirrors ?? [],
      });
    }
  } else {
    const primary = bvidOf(bili.url);
    if (primary)
      out.push({ label: "整稿(多分P)", primary, mirrors: bili.mirrors ?? [] });
  }
  return out;
}

type Row = {
  courseId: string;
  courseTitle: string;
  label: string;
  primary: string;
  primaryHealth: Health;
  mirrorHealth: { bvid: string; health: Health }[];
  /** urgent=主挂且无可用备源 / covered=主挂但有备源好 / ok */
  status: "urgent" | "covered" | "ok";
};

async function main() {
  loadEnv();
  if (!process.env.BILI_SESSDATA) {
    console.warn("⚠ 未设置 BILI_SESSDATA,部分稿件可能因风控误报失效。\n");
  }
  const wantJson = process.argv.includes("--json");
  const { courses } = loadContent();

  // 先去重收集所有稿件,同一 bvid 只探一次
  const items = courses.flatMap((c) =>
    collectBvids(c).map((b) => ({
      courseId: c.id,
      courseTitle: c.title,
      ...b,
    })),
  );
  const allBvids = new Set<string>();
  for (const it of items) {
    allBvids.add(it.primary);
    it.mirrors.forEach((m) => allBvids.add(m));
  }
  const total = allBvids.size;
  console.log(
    `探活 ${courses.length} 门课的 ${items.length} 个播放位、${total} 个去重稿件…\n`,
  );

  const cache = new Map<string, Health>();
  let done = 0;
  for (const bvid of allBvids) {
    const h = await probe(bvid);
    cache.set(bvid, h);
    done++;
    if (!h.alive)
      console.log(`  ✗ ${bvid}  code=${h.code} ${h.message} (${done}/${total})`);
    else if (done % 25 === 0) console.log(`  … ${done}/${total}`);
    await sleep(400); // 限速,别轰接口
  }

  const rows: Row[] = items.map((it) => {
    const primaryHealth = cache.get(it.primary)!;
    const mirrorHealth = it.mirrors.map((m) => ({
      bvid: m,
      health: cache.get(m)!,
    }));
    const anyMirrorAlive = mirrorHealth.some((m) => m.health.alive);
    const status: Row["status"] = primaryHealth.alive
      ? "ok"
      : anyMirrorAlive
        ? "covered"
        : "urgent";
    return { ...it, primaryHealth, mirrorHealth, status };
  });

  const urgent = rows.filter((r) => r.status === "urgent");
  const covered = rows.filter((r) => r.status === "covered");

  // ---- 台账 ----
  const lines: string[] = [];
  lines.push("# 视频失效探活报告");
  lines.push("");
  lines.push(
    `- 课程 ${courses.length} 门 · 播放位 ${items.length} 个 · 去重稿件 ${total} 个`,
  );
  lines.push(
    `- 🔴 主源失效且无可用备源 ${urgent.length} 处 · 🟡 主源失效但备源尚可 ${covered.length} 处`,
  );
  lines.push("");
  if (urgent.length) {
    lines.push("## 🔴 紧急:播放会直接失败,需尽快补备源或换主源");
    for (const r of urgent) {
      const mirrorNote = r.mirrorHealth.length
        ? `(备源也挂:${r.mirrorHealth.map((m) => `${m.bvid} code=${m.health.code}`).join(", ")})`
        : "(无备源)";
      lines.push(
        `- \`${r.courseId}\` ${r.courseTitle} — ${r.label}:主源 \`${r.primary}\` code=${r.primaryHealth.code} ${r.primaryHealth.message} ${mirrorNote}`,
      );
    }
    lines.push("");
  }
  if (covered.length) {
    lines.push("## 🟡 已被容错兜住:主源挂了但备源能播,建议把主源换成备源");
    for (const r of covered) {
      const goodMirror = r.mirrorHealth.find((m) => m.health.alive)?.bvid;
      lines.push(
        `- \`${r.courseId}\` ${r.courseTitle} — ${r.label}:主源 \`${r.primary}\` 挂,可用备源 \`${goodMirror}\``,
      );
    }
    lines.push("");
  }
  if (!urgent.length && !covered.length) {
    lines.push("✅ 全部主源在线,没有需要处理的失效稿件。");
  }

  const outDir = path.join(process.cwd(), "scratch");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "video-health.md");
  fs.writeFileSync(outFile, lines.join("\n") + "\n", "utf-8");

  console.log("\n" + lines.join("\n"));
  console.log(`\n台账已写入 ${path.relative(process.cwd(), outFile)}`);
  if (wantJson) {
    const jsonFile = path.join(outDir, "video-health.json");
    fs.writeFileSync(jsonFile, JSON.stringify(rows, null, 2), "utf-8");
    console.log(`JSON 已写入 ${path.relative(process.cwd(), jsonFile)}`);
  }
  process.exit(urgent.length ? 1 : 0);
}

main();
