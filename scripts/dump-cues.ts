/** 临时:拉某 bvid 指定语言的原始字幕 cue(带时间轴),供人工/LLM 重新断句。
 *  用法: npm run tsx scripts/dump-cues.ts -- BV.. en */
import fs from "node:fs";
import path from "node:path";
function loadEnv() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const l of fs.readFileSync(p, "utf-8").split("\n")) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const H = () => ({
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36",
  Referer: "https://www.bilibili.com",
  Cookie: `SESSDATA=${process.env.BILI_SESSDATA}`,
});
type Sub = { lan: string; subtitle_url?: string; subtitle_url_v2?: string };
type Cue = { from: number; to: number; content: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 上游 JSON 结构不固定,脚本内按需断言
const gj = async <T = any>(u: string): Promise<T> => (await fetch(u, { headers: H() })).json();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function main() {
  loadEnv();
  const bvid = process.argv[2];
  const lang = process.argv[3] || "en";
  const v = await gj(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
  const cid = v.data.pages[0].cid;
  const urlOf = (s?: Sub) => (s ? s.subtitle_url || s.subtitle_url_v2 || "" : "");
  const merged = new Map<string, Sub>();
  const absorb = (list?: Sub[]) => {
    for (const s of list ?? []) if (s?.lan && (!merged.has(s.lan) || (!urlOf(merged.get(s.lan)) && urlOf(s)))) merged.set(s.lan, s);
  };
  for (let i = 0; i < 4; i++) {
    try { const j = await gj(`https://api.bilibili.com/x/player/wbi/v2?bvid=${bvid}&cid=${cid}`); if (j.code === 0) absorb(j.data?.subtitle?.subtitles); } catch {}
    try { const j = await gj(`https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`); absorb(j.data?.subtitle?.subtitles); } catch {}
    const re = new RegExp(`^(ai-)?${lang}`, "i");
    const pick = [...merged.values()].find((s) => re.test(s.lan) && urlOf(s));
    if (pick) {
      const raw = urlOf(pick);
      const body = await gj<{ body?: Cue[] }>(raw.startsWith("//") ? `https:${raw}` : raw);
      const cues = (body.body ?? []).filter((c) => c.content?.trim());
      console.log(`# ${bvid} 轨=${pick.lan} 共 ${cues.length} cue`);
      for (const c of cues) console.log(`[${c.from.toFixed(2)}-${c.to.toFixed(2)}] ${c.content.trim()}`);
      return;
    }
    await sleep(1500);
  }
  console.error("没抓到轨:", [...merged.keys()].join(","));
  process.exit(1);
}
main();
