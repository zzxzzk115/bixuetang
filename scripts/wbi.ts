/**
 * 脚本用 WBI 签名(与 src/lib/bili/wbi.ts 同算法,脚本内自带一份避开 server-only)。
 * B 站较新的 player/wbi/v2 等接口不签名会返回残缺数据——实测表现:人工字幕轨
 * (人手校对的 en-US 等,带标点、质量最高)直接消失,只剩 ai- 轨。签名后才全。
 */
import { createHash } from "node:crypto";

const MIXIN_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33,
  9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17,
  0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

function biliHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
    Referer: "https://www.bilibili.com",
  };
  if (process.env.BILI_SESSDATA) h.Cookie = `SESSDATA=${process.env.BILI_SESSDATA}`;
  return h;
}

function keyFromUrl(u: string): string {
  return u.slice(u.lastIndexOf("/") + 1).split(".")[0];
}

let mixinCache = "";
async function mixinKey(): Promise<string> {
  if (mixinCache) return mixinCache;
  const res = await fetch("https://api.bilibili.com/x/web-interface/nav", {
    headers: biliHeaders(),
    cache: "no-store",
  });
  const json = (await res.json()) as {
    data?: { wbi_img?: { img_url: string; sub_url: string } };
  };
  const img = json.data?.wbi_img;
  if (!img) throw new Error("拿不到 WBI key");
  const raw = keyFromUrl(img.img_url) + keyFromUrl(img.sub_url);
  mixinCache = MIXIN_TAB.map((i) => raw[i]).join("").slice(0, 32);
  return mixinCache;
}

/** 给参数加上 wts/w_rid,返回可直接拼接的 query 串 */
export async function signWbi(
  params: Record<string, string | number>,
): Promise<string> {
  const mixin = await mixinKey();
  const wts = Math.floor(Date.now() / 1000);
  const merged: Record<string, string> = { wts: String(wts) };
  for (const [k, v] of Object.entries(params))
    merged[k] = String(v).replace(/[!'()*]/g, "");
  const query = Object.keys(merged)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(merged[k])}`)
    .join("&");
  const wRid = createHash("md5").update(query + mixin).digest("hex");
  return `${query}&w_rid=${wRid}`;
}

/** 签名后的完整 URL:base?signed */
export async function signedUrl(
  base: string,
  params: Record<string, string | number>,
): Promise<string> {
  return `${base}?${await signWbi(params)}`;
}
