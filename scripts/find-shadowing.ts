/**
 * 影子跟读选源器:WBI 签名搜索 B 站视频,逐条探测是否带**软字幕轨**(可 API 取的 CC),
 * 报告命中指定语言(默认 en)的候选,方便直接喂给 `make:shadowing`。
 *
 * 用法:
 *   npm run find:shadowing -- --kw "TED 中英字幕" [--lang en] [--pages 2] [--min 60] [--max 900]
 *   npm run find:shadowing -- --kw "老友记 英文字幕" --lang en
 *
 * --min/--max 时长秒数过滤(默认 30..1800,跟读素材别太长)。
 * 命中会打印一行可直接改用的 make:shadowing 命令。
 * 需要 .env.local 的 BILI_SESSDATA。搜索/字幕接口都可能被限流,命中率看运气。
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

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
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- WBI 签名(与 src/lib/bili/wbi.ts 同算法,脚本内自带一份避开 server-only) ----
const MIXIN_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33,
  9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17,
  0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];
let mixinCache = "";
function keyFromUrl(u: string) {
  return u.slice(u.lastIndexOf("/") + 1).split(".")[0];
}
async function mixinKey(): Promise<string> {
  if (mixinCache) return mixinCache;
  const j = await getJson<{ data?: { wbi_img?: { img_url: string; sub_url: string } } }>(
    "https://api.bilibili.com/x/web-interface/nav",
  );
  const img = j.data?.wbi_img;
  if (!img) throw new Error("拿不到 WBI key");
  const raw = keyFromUrl(img.img_url) + keyFromUrl(img.sub_url);
  mixinCache = MIXIN_TAB.map((i) => raw[i]).join("").slice(0, 32);
  return mixinCache;
}
async function signWbi(params: Record<string, string | number>): Promise<string> {
  const mixin = await mixinKey();
  const wts = Math.floor(Date.now() / 1000);
  const merged: Record<string, string> = { wts: String(wts) };
  for (const [k, v] of Object.entries(params)) merged[k] = String(v).replace(/[!'()*]/g, "");
  const query = Object.keys(merged)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(merged[k])}`)
    .join("&");
  const wRid = createHash("md5").update(query + mixin).digest("hex");
  return `${query}&w_rid=${wRid}`;
}

// ---- 搜索 ----
type SearchItem = { bvid: string; title: string; duration: string; play?: number; author?: string };
async function search(kw: string, page: number): Promise<SearchItem[]> {
  const q = await signWbi({ search_type: "video", keyword: kw, page, page_size: 30 });
  const j = await getJson<{ code: number; data?: { result?: SearchItem[] } }>(
    `https://api.bilibili.com/x/web-interface/wbi/search/type?${q}`,
  );
  if (j.code !== 0) throw new Error(`搜索 code=${j.code}`);
  return j.data?.result ?? [];
}
function durSec(d: string): number {
  // "12:30" / "1:02:30" / 秒数
  const parts = String(d).split(":").map(Number);
  if (parts.some(isNaN)) return 0;
  return parts.reduce((a, b) => a * 60 + b, 0);
}

// ---- 字幕探测(只看轨列表,不下正文) ----
type Sub = { lan: string; lan_doc?: string; subtitle_url?: string; subtitle_url_v2?: string };
type PV2 = { code: number; data?: { subtitle?: { subtitles?: Sub[] } } };
async function cidOf(bvid: string): Promise<number | null> {
  try {
    const v = await getJson<{ data?: { pages?: { cid: number }[] } }>(
      `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
    );
    return v.data?.pages?.[0]?.cid ?? null;
  } catch {
    return null;
  }
}
async function subTracks(bvid: string, cid: number): Promise<Sub[]> {
  const merged = new Map<string, Sub>();
  const urlOf = (s?: Sub) => (s ? s.subtitle_url || s.subtitle_url_v2 || "" : "");
  const absorb = (list?: Sub[]) => {
    for (const s of list ?? [])
      if (s?.lan && (!merged.has(s.lan) || (!urlOf(merged.get(s.lan)) && urlOf(s)))) merged.set(s.lan, s);
  };
  try {
    const j = await getJson<PV2>(`https://api.bilibili.com/x/player/wbi/v2?bvid=${bvid}&cid=${cid}`);
    if (j.code === 0) absorb(j.data?.subtitle?.subtitles);
  } catch {}
  try {
    const j = await getJson<PV2>(`https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`);
    absorb(j.data?.subtitle?.subtitles);
  } catch {}
  return [...merged.values()].filter((s) => urlOf(s));
}

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function main() {
  loadEnvLocal();
  if (!process.env.BILI_SESSDATA) {
    console.error("缺少 BILI_SESSDATA(.env.local)");
    process.exit(1);
  }
  const kw = arg("kw");
  const lang = arg("lang", "en")!;
  const pages = Number(arg("pages", "1"));
  const min = Number(arg("min", "30"));
  const max = Number(arg("max", "1800"));
  if (!kw) {
    console.error('用法: npm run find:shadowing -- --kw "TED 中英字幕" [--lang en] [--pages 2]');
    process.exit(1);
  }
  const re = new RegExp(`^(ai-)?${lang}`, "i");

  const seen = new Set<string>();
  let scanned = 0;
  const hits: { bvid: string; title: string; sec: number; tracks: string; ai: boolean }[] = [];
  for (let p = 1; p <= pages; p++) {
    let items: SearchItem[] = [];
    try {
      items = await search(kw, p);
    } catch (e) {
      console.error(`  搜索第 ${p} 页失败:`, e instanceof Error ? e.message : e);
      break;
    }
    for (const it of items) {
      const bvid = it.bvid;
      if (!bvid || seen.has(bvid)) continue;
      seen.add(bvid);
      const sec = durSec(it.duration);
      if (sec < min || sec > max) continue;
      scanned++;
      const cid = await cidOf(bvid);
      if (!cid) continue;
      const tracks = await subTracks(bvid, cid);
      const match = tracks.find((t) => re.test(t.lan));
      const title = (it.title || "").replace(/<[^>]+>/g, "");
      if (match) {
        hits.push({
          bvid,
          title,
          sec,
          tracks: tracks.map((t) => t.lan).join(","),
          ai: /^ai-/i.test(match.lan),
        });
        console.log(
          `✔ ${bvid}  ${Math.floor(sec / 60)}分  轨[${tracks.map((t) => t.lan).join(",")}]  ${title.slice(0, 40)}`,
        );
      }
      await sleep(700);
    }
    await sleep(1000);
  }

  console.log(`\n扫描 ${scanned} 条,命中 ${lang} 软字幕 ${hits.length} 条:`);
  if (!hits.length) {
    console.log("(无。可能全是硬字幕/被限流/该关键词无软字幕源。换关键词或稍后再试。)");
    return;
  }
  console.log("\n可直接生成(改 --id/--title/--level 后运行):");
  for (const h of hits) {
    const idBase = `${lang}-lv-${h.bvid.toLowerCase()}`;
    const flag = h.ai ? "  # ⚠ ai- 轨,可能是机器转写/串轨,生成后务必抽查" : "";
    console.log(
      `  npm run make:shadowing -- --bvid ${h.bvid} --lang ${lang} --level l3 --id ${idBase} --title "${h.title.slice(0, 24)}"${flag}`,
    );
  }
}

main().catch((e) => {
  console.error("✖", e instanceof Error ? e.message : e);
  process.exit(1);
});
