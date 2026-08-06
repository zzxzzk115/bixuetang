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
  /**
   * 选中的语言代码，可多选并叠加显示（中英对照很实用）。
   * 空数组 = 自动用第一条轨。
   */
  lans: string[];
  /** 字号缩放 0.7~1.8 */
  scale: number;
  /** 距底部的比例 0.02~0.35 */
  bottom: number;
  /** 底色样式 */
  style: "shadow" | "box" | "plain";
}

export interface PlayerPrefs {
  /** 默认值版本：改默认值时 +1，让老用户存的偏好跟着更新 */
  v: number;
  volume: number;
  muted: boolean;
  rate: number;
  danmaku: DanmakuSettings;
  cc: CcSettings;
  /** 记住的清晰度 id，找不到就退到最高档 */
  qualityId: number | null;
  /** DASH 模式下让 dash.js 按带宽自动切清晰度；手动选过档位后关掉 */
  autoQuality: boolean;
  /** 切走标签页/窗口失焦时自动暂停 */
  pauseOnBlur: boolean;
}

export const PREFS_VERSION = 6;

export const DEFAULT_PREFS: PlayerPrefs = {
  v: PREFS_VERSION,
  volume: 1,
  muted: false,
  rate: 1,
  danmaku: {
    // 默认关：学习场景弹幕更多是干扰，想看再开
    on: false,
    opacity: 0.9,
    scale: 1,
    speed: 1,
    area: 0.5,
    blockScroll: false,
    blockTop: false,
    blockBottom: false,
  },
  cc: {
    // 默认开：自动挑人工字幕（中文优先，其次英文），实在没有才退到 AI 轨
    on: true,
    lans: [],
    scale: 1,
    bottom: 0.06,
    style: "shadow",
  },
  qualityId: null,
  autoQuality: true,
  // 默认开：人走了视频还在放，进度会白记一段
  pauseOnBlur: true,
};

const KEY = "guild-player-prefs";

function read(): PlayerPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<PlayerPrefs>;
    // 默认值版本变了就重置（否则老用户永远拿不到新默认）
    if (parsed.v !== PREFS_VERSION) return DEFAULT_PREFS;
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
//
// 权威在数据库（跨设备一致），localStorage 只是首帧缓存——
// 页面挂载时用服务端值 hydrate 一次，之后每次改动同步写两边。
let cache: PlayerPrefs | null = null;
let listeners: (() => void)[] = [];
let persist: ((json: string) => void) | null = null;

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
  /** 注册落库回调（由播放器在挂载时接上 server action） */
  bindPersist(fn: (json: string) => void) {
    persist = fn;
  },
  /** 用服务端存的偏好初始化（登录后首次挂载调用一次） */
  hydrate(json: string | null) {
    if (!json) return;
    try {
      const parsed = JSON.parse(json) as Partial<PlayerPrefs>;
      if (parsed.v !== PREFS_VERSION) return;
      cache = {
        ...DEFAULT_PREFS,
        ...parsed,
        danmaku: { ...DEFAULT_PREFS.danmaku, ...(parsed.danmaku ?? {}) },
        cc: { ...DEFAULT_PREFS.cc, ...(parsed.cc ?? {}) },
      };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(cache));
      } catch {
        // 隐私模式无所谓，库里那份才是权威
      }
      for (const listener of listeners) listener();
    } catch {
      // 坏数据忽略
    }
  },
  set(patch: Partial<PlayerPrefs>) {
    const next = { ...prefsStore.get(), ...patch };
    cache = next;
    const json = JSON.stringify(next);
    try {
      window.localStorage.setItem(KEY, json);
    } catch {
      // 隐私模式存不了就算了
    }
    persist?.(json);
    for (const listener of listeners) listener();
  },
};

export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
