// 全屏庆祝事件总线：动作组件 dispatch，layout 里的 CelebrationLayer 监听。
// 用 window 事件而非组件状态——服务端 revalidation 会把动作按钮重渲染/卸载，
// 但挂在 layout 的监听层不受影响，庆祝动画得以完整播放。

export type CelebrationKind = "boss" | "level" | "promote";

export interface Celebration {
  kind: CelebrationKind;
  title: string;
  subtitle?: string;
}

export const CELEBRATE_EVENT = "guild:celebrate";

export function celebrate(detail: Celebration) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<Celebration>(CELEBRATE_EVENT, { detail }));
}
