// 游戏（Phaser）与 React 之间的双向桥。
//
// 沿用项目里已有的 CustomEvent 总线风格（rpg-events.ts / celebrate.ts / seek.ts）：
//   · 游戏 → React：dispatch window CustomEvent，DOM 层（GameWindows/HUD）监听
//   · React → 游戏：GameShell 持有 Phaser.Game 引用，直接 game.events.emit
//
// 数据闭环：DOM 窗口里调 server action（如 toggleEpisode）→ 拿返回的结算包
//   → emit TO_GAME.profileUpdated → 场景增量刷新。不轮询、不二次 fetch。

import type { GameBootstrap } from "./bootstrap-types";

/** 游戏 → React 的窗口/导航请求 */
export const GAME_EVENT = "guild:game";

export type GameWindowName =
  | "course"
  | "glossary"
  | "inventory"
  | "quests";

export type GameToReact =
  | { type: "open-window"; window: GameWindowName; props?: Record<string, string> }
  | { type: "leave-game"; href: string; confirm?: string }
  | { type: "hud"; coins?: number; totalXp?: number };

export function announceGame(ev: GameToReact): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<GameToReact>(GAME_EVENT, { detail: ev }));
}

/** React → 游戏：Phaser.Game.events 上的事件名 */
export const TO_GAME = {
  /** DOM 窗口关闭，场景恢复输入 */
  windowClosed: "guild:window-closed",
  /** 进度/装备变更后推给场景刷 HUD 与楼层状态 */
  profileUpdated: "guild:profile-updated",
} as const;

export type ProfilePatch = Partial<
  Pick<GameBootstrap, "level" | "rpg">
> & {
  /** 某课程某集刚被勾选，塔场景据此刷该楼层血条 */
  episode?: { courseId: string; watchedCount: number; done: boolean };
};
