/**
 * 从一条 B 站视频的**真实字幕轨**生成影子跟读单元:每条字幕 cue = 一个跟读句
 * (text=原文, from/to=该句时间轴)。这样练习者读/跟的正好是听到的那句。
 *
 * 用法:
 *   npm run make:shadowing -- --bvid BV1xxx --lang en --level l3 \
 *       --id en-l3-ted-xxx --title "标题" [--page 1] [--max 20] [--minChars 8]
 *
 * --lang 取字幕轨语言前缀(en 会匹配 en/en-US/ai-en);影子跟读英语就取 en。
 * 需要 .env.local 的 BILI_SESSDATA。抓不到该语言的软字幕(硬字幕/被限流)会报错退出。
 */
import fs from "node:fs";
import path from "node:path";
import { signedUrl } from "./wbi";

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
    Referer: "https://www.bilibili.com",
  };
  if (process.env.BILI_SESSDATA) h.Cookie = `SESSDATA=${process.env.BILI_SESSDATA}`;
  return h;
}
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return (await res.json()) as T;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Cue = { from: number; to: number; content: string };
type Sub = { lan: string; subtitle_url?: string; subtitle_url_v2?: string };
type PV2 = { code: number; data?: { subtitle?: { subtitles?: Sub[] } } };

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function cidOf(bvid: string, page: number): Promise<number> {
  const v = await getJson<{ data?: { pages: { cid: number; page: number }[] } }>(
    `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
  );
  const pg = v.data?.pages?.find((p) => p.page === page) ?? v.data?.pages?.[0];
  if (!pg) throw new Error("拿不到 cid");
  return pg.cid;
}

/** 取指定语言前缀的字幕 cue(wbi 412 时回退 player/v2,与运行时一致) */
async function cuesForLang(bvid: string, cid: number, lang: string): Promise<Cue[]> {
  const merged = new Map<string, Sub>();
  const urlOf = (s?: Sub) => (s ? s.subtitle_url || s.subtitle_url_v2 || "" : "");
  const absorb = (list?: Sub[]) => {
    for (const s of list ?? []) if (s?.lan && (!merged.has(s.lan) || (!urlOf(merged.get(s.lan)) && urlOf(s)))) merged.set(s.lan, s);
  };
  // WBI 签名的 wbi/v2 才会返回人工字幕轨(en-US 等,带标点、质量最高);
  // 未签名只剩 ai- 轨。签名失败再回退未签名 player/v2。
  try {
    const url = await signedUrl("https://api.bilibili.com/x/player/wbi/v2", { bvid, cid });
    const j = await getJson<PV2>(url);
    if (j.code === 0) absorb(j.data?.subtitle?.subtitles);
  } catch {
    /* 签名/网络失败 → 回退 */
  }
  for (let i = 0; i < 3; i++) {
    try {
      const j = await getJson<PV2>(`https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`);
      absorb(j.data?.subtitle?.subtitles);
    } catch {
      /* ignore */
    }
    if ([...merged.keys()].some((l) => l.toLowerCase().startsWith(lang))) break;
    await sleep(1500);
  }
  const re = new RegExp(`^(ai-)?${lang}`, "i");
  const pick = [...merged.values()].find((s) => re.test(s.lan) && urlOf(s));
  if (!pick) {
    throw new Error(
      `没抓到 ${lang} 软字幕(现有轨:${[...merged.keys()].join(",") || "无"})。可能硬字幕/被限流/该源无此语言。`,
    );
  }
  const raw = urlOf(pick);
  const body = await getJson<{ body: Cue[] }>(raw.startsWith("//") ? `https:${raw}` : raw);
  return (body.body ?? []).filter((c) => c.content?.trim());
}

function esc(s: string) {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * ASR 字幕轨常把一句拆成好几条碎 cue(如「you know」单独 0.3s),
 * 直接每条当一句会让跟读支离破碎。合并策略:相邻 cue 连成一句,直到
 * 达到 minSec 时长且 minWords 词数,或原 cue 间存在明显停顿(gap≥pauseSec)。
 * 保留合并后整段的 from/to,text 用空格拼接。
 */
function mergeCues(cues: Cue[], opts: { minSec: number; minWords: number; pauseSec: number; maxSec: number }): Cue[] {
  const out: Cue[] = [];
  let cur: Cue | null = null;
  const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
  for (const c of cues) {
    const content = c.content.trim();
    if (!content) continue;
    if (!cur) {
      cur = { from: c.from, to: c.to, content };
      continue;
    }
    const gap = c.from - cur.to;
    const curLong = cur.to - cur.from >= opts.minSec && words(cur.content) >= opts.minWords;
    const wouldOverflow = c.to - cur.from > opts.maxSec;
    // 已够长、或中间有明显停顿、或再并会超上限 → 断句
    if (curLong || gap >= opts.pauseSec || wouldOverflow) {
      out.push(cur);
      cur = { from: c.from, to: c.to, content };
    } else {
      cur = { from: cur.from, to: c.to, content: `${cur.content} ${content}` };
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** ASR 无标点:句首大写、"i" 独立时大写、结尾补句点,轻量可读化(不改词) */
function tidy(text: string): string {
  let s = text.trim().replace(/\s+/g, " ");
  s = s.replace(/\bi\b/g, "I");
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (!/[.?!]$/.test(s)) s += ".";
  return s;
}

async function main() {
  loadEnvLocal();
  if (!process.env.BILI_SESSDATA) {
    console.error("缺少 BILI_SESSDATA(.env.local)");
    process.exit(1);
  }
  const bvid = arg("bvid");
  const id = arg("id");
  const title = arg("title");
  const lang = arg("lang", "en")!;
  const level = arg("level", "l3")!;
  const page = Number(arg("page", "1"));
  const max = Number(arg("max", "0"));
  const minChars = Number(arg("minChars", "6"));
  if (!bvid || !id || !title) {
    console.error("用法: npm run make:shadowing -- --bvid BV.. --id .. --title .. [--lang en] [--level l3] [--page 1] [--max 20]");
    process.exit(1);
  }

  const cid = await cidOf(bvid, page);
  let cues = await cuesForLang(bvid, cid, lang);
  // 英文 ASR 轨先合并碎 cue 成自然句;中日文按字不按空格,跳过合并
  if (/^en/i.test(lang)) {
    cues = mergeCues(cues, { minSec: 1.6, minWords: 5, pauseSec: 0.7, maxSec: 9 });
    cues = cues.map((c) => ({ ...c, content: tidy(c.content) }));
  }
  // 过掉过短的碎句;可选截取前 max 句
  cues = cues.filter((c) => c.content.trim().length >= minChars);
  if (max > 0) cues = cues.slice(0, max);
  if (cues.length === 0) throw new Error("过滤后没有可用句子");

  const lines = [
    `# ⚠ 草稿:由 ${bvid} 的真实 ${lang} 字幕轨机械切分而成(按时长/停顿,非语义)。`,
    `# ASR 无标点,句子边界切不准 → 发布前需人工/LLM 按语义重新断句:`,
    `#   npx tsx scripts/dump-cues.ts ${bvid} ${lang}   # 看逐字 cue+时间轴`,
    `# 规则:一句=一条或多条【完整】cue(不可拆 cue,否则文与音对不上),`,
    `# 合并成完整句、补标点、可选加 zh。参考 en-l3-first-20-hours.yaml。`,
    `id: ${id}`,
    `title: ${title}`,
    `lang: ${lang === "en" ? "en" : lang}`,
    `level: ${level}`,
    `source:`,
    `  platform: bilibili`,
    `  url: https://www.bilibili.com/video/${bvid}`,
    `bvid: ${bvid}`,
    `page: ${page}`,
    `sentences:`,
    ...cues.map(
      (c) =>
        `  - text: ${esc(c.content.trim())}\n    from: ${c.from}\n    to: ${c.to}`,
    ),
  ];
  const out = path.join(process.cwd(), "content", "shadowing", `${id}.yaml`);
  fs.writeFileSync(out, lines.join("\n") + "\n", "utf-8");
  console.log(`✔ 写入 ${out}:${cues.length} 句(轨 ${lang},cid ${cid})`);
}

main().catch((e) => {
  console.error("✖", e instanceof Error ? e.message : e);
  process.exit(1);
});
