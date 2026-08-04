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
  /** 该集的独立 bilibili 稿件（ugc_season 合集课程），优先于 page */
  bvid?: string;
  /**
   * 原站模式：直接嵌 www.bilibili.com 视频页而非 player.html。
   * bilibili 主站没有 X-Frame-Options，技术上可嵌；主站播放器有弹幕/画质/倍速完整 UI。
   * 注意：bilibili cookie 未设 SameSite（浏览器按 Lax 处理），跨站 iframe 不会携带
   * 登录态，所以清晰度仍是游客上限——要登录态高清只能用浏览器插件在原站看。
   */
  nativePage?: boolean;
}

export function embedFor(source: Source, opts: EmbedOptions = {}): Embed {
  if (source.platform === "bilibili") {
    // 支持 /video/BVxxxx 与 /video/avNNN（分 P 用 ?p=N）
    // 合集类课程每集是独立稿件，此时用 opts.bvid 覆盖
    const bv = opts.bvid ?? source.url.match(/\/video\/(BV[0-9A-Za-z]+)/)?.[1];
    const av = opts.bvid ? undefined : source.url.match(/\/video\/av(\d+)/)?.[1];
    if (bv || av) {
      // 独立稿件不需要分 P 参数
      const p = opts.bvid
        ? undefined
        : (opts.page ?? source.url.match(/[?&]p=(\d+)/)?.[1]);

      if (opts.nativePage && bv) {
        const q = new URLSearchParams();
        if (p) q.set("p", String(p));
        if (opts.startSeconds) q.set("t", String(Math.floor(opts.startSeconds)));
        const qs = q.toString();
        return {
          kind: "iframe",
          src: `https://www.bilibili.com/video/${bv}/${qs ? `?${qs}` : ""}`,
        };
      }
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
