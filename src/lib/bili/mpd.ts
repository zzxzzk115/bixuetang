// 把 bilibili playurl 的 DASH 流信息合成为标准静态 MPD（SegmentBase 寻址）。
//
// bilibili 不给现成的 manifest，但每路流都带 segment_base 字节区间
// （moov 初始段 + sidx 索引段），这正是 SegmentBase 寻址所需的全部信息。
// dash.js 拿到这份 MPD 后自己 Range 拉分片、走 MSE 拼流——时长、seek、
// 画音同步全是它的本职，我们不再手写任何同步逻辑。
//
// 纯函数、无 IO：方便单测，也保证 1 核 VPS 上的开销只是字符串拼接。

import type { DashStream } from "./api";

/**
 * 编码优先级：AVC 是唯一全设备硬解的编码（AV1 到 A17 Pro 才有硬解，
 * HEVC 在部分安卓/桌面浏览器不可用），学习网站要的是「都能放」。
 */
function codecRank(codecs: string): number {
  const c = codecs.toLowerCase();
  if (c.startsWith("avc1") || c.startsWith("avc3")) return 0;
  if (c.startsWith("hev1") || c.startsWith("hvc1")) return 1;
  if (c.startsWith("av01")) return 2;
  return 3;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 缺了字节区间的流没法做 SegmentBase 寻址，直接剔除 */
function usable(s: DashStream): boolean {
  return !!s.baseUrl && !!s.initRange && !!s.indexRange;
}

/**
 * 同一清晰度 bilibili 会给 AVC/HEVC/AV1 多路流；每个 qn 只留优先级最高
 * 的一路。混编码的 AdaptationSet 会让部分浏览器换清晰度时重建解码器。
 */
export function pickVideoStreams(video: DashStream[]): DashStream[] {
  const byId = new Map<number, DashStream>();
  for (const s of video) {
    if (!usable(s)) continue;
    const prev = byId.get(s.id);
    if (!prev || codecRank(s.codecs) < codecRank(prev.codecs)) {
      byId.set(s.id, s);
    }
  }
  return [...byId.values()].sort((a, b) => b.id - a.id);
}

function representation(
  s: DashStream,
  idPrefix: string,
  proxyUrl: (u: string) => string,
): string {
  const attrs = [
    `id="${idPrefix}${s.id}"`,
    `bandwidth="${Math.max(1, s.bandwidth)}"`,
    `codecs="${escapeXml(s.codecs)}"`,
    `mimeType="${escapeXml(s.mimeType)}"`,
  ];
  if (s.width) attrs.push(`width="${s.width}"`);
  if (s.height) attrs.push(`height="${s.height}"`);
  if (s.frameRate) attrs.push(`frameRate="${escapeXml(s.frameRate)}"`);

  // 主源 + 备源都写进去：dash.js 对多 BaseURL 会自动 failover，
  // 代理路由（stream）自身完全不用管重试。
  const urls = [s.baseUrl, ...s.backupUrls]
    .filter(Boolean)
    .map((u) => `      <BaseURL>${escapeXml(proxyUrl(u))}</BaseURL>`)
    .join("\n");

  return [
    `    <Representation ${attrs.join(" ")}>`,
    urls,
    `      <SegmentBase indexRange="${escapeXml(s.indexRange!)}">`,
    `        <Initialization range="${escapeXml(s.initRange!)}"/>`,
    `      </SegmentBase>`,
    `    </Representation>`,
  ].join("\n");
}

export interface MpdInput {
  durationSec: number;
  video: DashStream[];
  audio: DashStream[];
}

/**
 * 合成静态 MPD。返回 null 表示没有任何可用视频流（调用方降级到 MP4）。
 * proxyUrl 把上游直链改写为本站代理地址（bilibili 直链要求 Referer，
 * 浏览器带不了，字节必须走 /api/bili/stream）。
 */
export function buildMpd(
  info: MpdInput,
  proxyUrl: (u: string) => string,
): string | null {
  const video = pickVideoStreams(info.video);
  if (video.length === 0) return null;
  const audio = info.audio.filter(usable).sort((a, b) => b.bandwidth - a.bandwidth);

  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(
    `<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" type="static" mediaPresentationDuration="PT${info.durationSec}S" minBufferTime="PT4S">`,
  );
  parts.push(`  <Period>`);
  parts.push(
    `  <AdaptationSet contentType="video" segmentAlignment="true" startWithSAP="1">`,
  );
  for (const s of video) parts.push(representation(s, "v", proxyUrl));
  parts.push(`  </AdaptationSet>`);
  if (audio.length > 0) {
    parts.push(
      `  <AdaptationSet contentType="audio" segmentAlignment="true" startWithSAP="1">`,
    );
    for (const s of audio) parts.push(representation(s, "a", proxyUrl));
    parts.push(`  </AdaptationSet>`);
  }
  parts.push(`  </Period>`);
  parts.push(`</MPD>`);
  return parts.join("\n");
}
