import type { Source } from "./content/schema";

// 视频源 → 嵌入地址。解析不了的 URL 降级为外链卡片，
// 这样内容作者贴任何链接（官网 / 合集页 / 频道页）都不会坏。

export type Embed =
  | { kind: "iframe"; src: string }
  | { kind: "link"; href: string };

export interface EmbedOptions {
  /** 分 P / 播放列表序号（1-based，即课程集数） */
  page?: number;
  /** 起播秒数（iframe 无跨域控制接口，跳转靠换 src 重载） */
  startSeconds?: number;
}

export function embedFor(source: Source, opts: EmbedOptions = {}): Embed {
  if (source.platform === "bilibili") {
    // 支持 /video/BVxxxx 与 /video/avNNN（分 P 用 ?p=N）
    const bv = source.url.match(/\/video\/(BV[0-9A-Za-z]+)/)?.[1];
    const av = source.url.match(/\/video\/av(\d+)/)?.[1];
    if (bv || av) {
      const p = opts.page ?? source.url.match(/[?&]p=(\d+)/)?.[1];
      // high_quality=1: 游客默认拉到可用的最高清晰度（1080P 上限，大会员档位仍需登录）
      const params = new URLSearchParams({
        autoplay: "0",
        high_quality: "1",
        danmaku: "0",
      });
      if (bv) params.set("bvid", bv);
      else params.set("aid", av!);
      if (p) params.set("p", String(p));
      if (opts.startSeconds) {
        params.set("t", String(Math.floor(opts.startSeconds)));
      }
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
    const params = new URLSearchParams();
    if (opts.startSeconds) {
      params.set("start", String(Math.floor(opts.startSeconds)));
    }
    if (vid) {
      if (list) params.set("list", list);
      const qs = params.toString();
      return {
        kind: "iframe",
        src: `https://www.youtube.com/embed/${vid}${qs ? `?${qs}` : ""}`,
      };
    }
    if (list) {
      params.set("list", list);
      if (opts.page) params.set("index", String(opts.page));
      return {
        kind: "iframe",
        src: `https://www.youtube.com/embed/videoseries?${params}`,
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
