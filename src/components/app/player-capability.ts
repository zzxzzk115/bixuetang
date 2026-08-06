// 播放能力检测:决定向 /api/bili/play 要哪种流。
//
// dash = 有 MSE(桌面全家 + 安卓)或 ManagedMediaSource(iOS 17.1+ 的
// iPhone Safari 终于有了),交给 dash.js 播分片流,1080P+ 且自适应码率。
// mp4 = 都没有的老设备(iOS <17.1 等),回退单文件渐进 MP4(≤720P)。

export type PlayMode = "dash" | "mp4";

export function detectPlayMode(): PlayMode {
  if (typeof window === "undefined") return "mp4";
  const w = window as unknown as {
    ManagedMediaSource?: unknown;
    MediaSource?: unknown;
  };
  return w.ManagedMediaSource || w.MediaSource ? "dash" : "mp4";
}
