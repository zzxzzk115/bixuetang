import "server-only";

import { createHash } from "node:crypto";

// WBI 签名。bilibili 较新的接口（player/wbi/v2 等）要求请求带 w_rid/wts 签名，
// 不签名会返回残缺数据——实测表现为：字幕轨时有时无、人工字幕轨直接消失。
//
// 算法是公开的：从 nav 接口拿两把 key，按固定置换表洗出 mixin key，
// 再对排序后的 query 串做 md5。

const MIXIN_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
];

interface KeyCache {
  mixin: string;
  day: string;
}

// key 每天轮换，按天缓存即可
const cache = globalThis as unknown as { __biliWbi?: KeyCache };

function keyFromUrl(url: string): string {
  return url.slice(url.lastIndexOf("/") + 1).split(".")[0];
}

function mixinKey(imgKey: string, subKey: string): string {
  const raw = imgKey + subKey;
  return MIXIN_TAB.map((i) => raw[i])
    .join("")
    .slice(0, 32);
}

async function getMixinKey(headers: Record<string, string>): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  if (cache.__biliWbi?.day === day) return cache.__biliWbi.mixin;

  const res = await fetch("https://api.bilibili.com/x/web-interface/nav", {
    headers,
    cache: "no-store",
  });
  const json = (await res.json()) as {
    data?: { wbi_img?: { img_url: string; sub_url: string } };
  };
  const img = json.data?.wbi_img;
  if (!img) throw new Error("拿不到 WBI key");
  const mixin = mixinKey(keyFromUrl(img.img_url), keyFromUrl(img.sub_url));
  cache.__biliWbi = { mixin, day };
  return mixin;
}

/** 给参数加上 wts/w_rid，返回可直接拼接的 query 串 */
export async function signWbi(
  params: Record<string, string | number>,
  headers: Record<string, string>,
): Promise<string> {
  const mixin = await getMixinKey(headers);
  const wts = Math.floor(Date.now() / 1000);
  const merged: Record<string, string> = { wts: String(wts) };
  for (const [k, v] of Object.entries(params)) {
    // 规范要求过滤掉这几个字符
    merged[k] = String(v).replace(/[!'()*]/g, "");
  }
  const query = Object.keys(merged)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(merged[k])}`)
    .join("&");
  const wRid = createHash("md5")
    .update(query + mixin)
    .digest("hex");
  return `${query}&w_rid=${wRid}`;
}
