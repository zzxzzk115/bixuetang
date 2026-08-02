// 播放器跳转事件总线（与 celebrate.ts 同模式）：
// 分析面板 dispatch，EmbedPlayer 监听后换 src 重载到指定分 P/时间点。

export interface SeekRequest {
  /** 分 P / 播放列表序号（即课程集数 n） */
  page?: number;
  /** 秒 */
  seconds?: number;
}

export const SEEK_EVENT = "guild:seek";

export function seekTo(detail: SeekRequest) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SeekRequest>(SEEK_EVENT, { detail }));
}
