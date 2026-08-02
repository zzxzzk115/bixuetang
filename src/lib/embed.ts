import type { Source } from "./content/schema";

// 视频源 → 嵌入地址。解析不了的 URL 降级为外链卡片，
// 这样内容作者贴任何链接（官网 / 合集页 / 频道页）都不会坏。

export type Embed =
  | { kind: "iframe"; src: string }
  | { kind: "link"; href: string };

export function embedFor(source: Source): Embed {
  if (source.platform === "bilibili") {
    // 支持 /video/BVxxxx（分 P 用 ?p=N）
    const bv = source.url.match(/\/video\/(BV[0-9A-Za-z]+)/)?.[1];
    const av = source.url.match(/\/video\/av(\d+)/)?.[1];
    if (bv || av) {
      const p = source.url.match(/[?&]p=(\d+)/)?.[1];
      // high_quality=1: 游客默认拉到可用的最高清晰度（1080P 上限，大会员档位仍需登录）
      const params = new URLSearchParams({
        autoplay: "0",
        high_quality: "1",
        danmaku: "0",
      });
      if (bv) params.set("bvid", bv);
      else params.set("aid", av!);
      if (p) params.set("p", p);
      return {
        kind: "iframe",
        src: `//player.bilibili.com/player.html?${params}`,
      };
    }
  }
  if (source.platform === "youtube") {
    const list = source.url.match(/[?&]list=([\w-]+)/)?.[1];
    const vid =
      source.url.match(/[?&]v=([\w-]+)/)?.[1] ??
      source.url.match(/youtu\.be\/([\w-]+)/)?.[1];
    if (vid) {
      const suffix = list ? `?list=${list}` : "";
      return { kind: "iframe", src: `https://www.youtube.com/embed/${vid}${suffix}` };
    }
    if (list) {
      return {
        kind: "iframe",
        src: `https://www.youtube.com/embed/videoseries?list=${list}`,
      };
    }
  }
  return { kind: "link", href: source.url };
}

export const PLATFORM_LABEL: Record<Source["platform"], string> = {
  bilibili: "哔哩哔哩",
  youtube: "YouTube",
  other: "官网",
};
