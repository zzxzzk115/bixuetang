/**
 * 课程选源小工具:签名搜索 B 站视频,或列出某 bvid 的分 P(用作 episodes)。
 *   npm run tsx scripts/bili-course.ts -- search "中国通史 纪录片"
 *   npm run tsx scripts/bili-course.ts -- pages BV1xxxx
 * 需要 .env.local 的 BILI_SESSDATA。
 */
import fs from "node:fs";
import path from "node:path";
import { signedUrl } from "./wbi";

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gj = async (u: string): Promise<any> => (await fetch(u, { headers: H() })).json();

async function main() {
  loadEnv();
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "search") {
    const url = await signedUrl("https://api.bilibili.com/x/web-interface/wbi/search/type", {
      search_type: "video",
      keyword: arg,
      page: 1,
      page_size: 25,
    });
    const j = await gj(url);
    for (const v of j?.data?.result ?? []) {
      const title = (v.title || "").replace(/<[^>]+>/g, "");
      console.log(`${v.bvid}  ⏱${v.duration}  ▶${v.play}  P?  ${title.slice(0, 46)}`);
    }
  } else if (cmd === "pages") {
    const v = await gj(`https://api.bilibili.com/x/web-interface/view?bvid=${arg}`);
    const d = v?.data;
    if (!d) return console.error("拿不到 view:", v?.code, v?.message);
    // 查真视频还是「静图配音频」(通史音频版帧率=1):取 playurl dash 的 frame_rate
    let vhint = "?";
    try {
      const cid = d.pages?.[0]?.cid;
      const pu = await gj(
        await signedUrl("https://api.bilibili.com/x/player/wbi/playurl", {
          bvid: arg,
          cid,
          fnval: 4048,
          fourk: 1,
        }),
      );
      const frs = (pu?.data?.dash?.video ?? []).map(
        (s: { frame_rate?: string }) => parseFloat(s.frame_rate ?? "0"),
      );
      const maxFr = Math.max(0, ...frs);
      vhint = maxFr <= 2 ? `⚠ 疑似纯音频(帧率${maxFr})` : `真视频(帧率${maxFr})`;
    } catch {
      vhint = "帧率未知";
    }
    console.log(`# ${arg} 「${d.title}」 分P ${d.videos} 个 · UP ${d.owner?.name} · ${vhint}`);
    for (const p of d.pages ?? []) console.log(`${p.page}\t${p.part}`);
  } else {
    console.error('用法: search "关键词" | pages BVxxxx');
  }
}
main();
