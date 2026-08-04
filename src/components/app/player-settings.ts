// 播放器偏好设置：弹幕 / 字幕 / 音量 / 倍速，存 localStorage，跨集跨课保持。

export interface DanmakuSettings {
  on: boolean;
  /** 不透明度 0.1~1 */
  opacity: number;
  /** 字号缩放 0.6~1.6 */
  scale: number;
  /** 滚动速度倍率 0.5~2（越大越快） */
  speed: number;
  /** 显示区域占画面高度的比例 0.25/0.5/0.75/1 */
  area: number;
  /** 屏蔽类型 */
  blockScroll: boolean;
  blockTop: boolean;
  blockBottom: boolean;
}

export interface CcSettings {
  on: boolean;
  /** 选中的语言代码，空=自动取第一条 */
  lan: string;
  /** 字号缩放 0.7~1.8 */
  scale: number;
  /** 距底部的比例 0.02~0.35 */
  bottom: number;
  /** 底色样式 */
  style: "shadow" | "box" | "plain";
}

export interface PlayerPrefs {
  volume: number;
  muted: boolean;
  rate: number;
  danmaku: DanmakuSettings;
  cc: CcSettings;
  /** 记住的清晰度 id，找不到就退到最高档 */
  qualityId: number | null;
}

export const DEFAULT_PREFS: PlayerPrefs = {
  volume: 1,
  muted: false,
  rate: 1,
  danmaku: {
    on: true,
    opacity: 0.9,
    scale: 1,
    speed: 1,
    area: 0.5,
    blockScroll: false,
    blockTop: false,
    blockBottom: false,
  },
  cc: {
    on: true,
    lan: "",
    scale: 1,
    bottom: 0.06,
    style: "shadow",
  },
  qualityId: null,
};

const KEY = "guild-player-prefs";

function read(): PlayerPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<PlayerPrefs>;
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      danmaku: { ...DEFAULT_PREFS.danmaku, ...(parsed.danmaku ?? {}) },
      cc: { ...DEFAULT_PREFS.cc, ...(parsed.cc ?? {}) },
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

// 外部存储式偏好：useSyncExternalStore 订阅，SSR 走默认值不会水合失配；
// 弹幕渲染循环也能直接 get() 到最新设置，不必额外挂 ref。
let cache: PlayerPrefs | null = null;
let listeners: (() => void)[] = [];

export const prefsStore = {
  subscribe(listener: () => void) {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },
  get(): PlayerPrefs {
    if (!cache) cache = read();
    return cache;
  },
  getServerSnapshot(): PlayerPrefs {
    return DEFAULT_PREFS;
  },
  set(patch: Partial<PlayerPrefs>) {
    const next = { ...prefsStore.get(), ...patch };
    cache = next;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // 隐私模式存不了就算了
    }
    for (const listener of listeners) listener();
  },
};

export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
