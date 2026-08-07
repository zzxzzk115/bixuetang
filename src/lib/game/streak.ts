// 连续学习天数(streak)的推进逻辑,纯函数。
//
// 心理学依据:损失厌恶(loss aversion)——「不想断掉 37 天连胜」比
// 「想再拿 10 XP」的驱动力强得多;连胜冻结是它的安全阀:偶尔一天
// 没学不至于全盘归零,防止一次失守后彻底放弃(what-the-hell effect)。

import { diffDays } from "./day";

export interface StreakState {
  current: number;
  best: number;
  /** 最后一次有学习行为的 dayKey;空串 = 从没学过 */
  lastDay: string;
  /** 手上的连胜冻结数(商店购买,断档时自动消耗) */
  freezes: number;
}

export interface StreakAdvance extends StreakState {
  /** 本次推进是否消耗了冻结 */
  usedFreeze: boolean;
  /** current 是否发生变化(UI 据此决定要不要庆祝) */
  changed: boolean;
}

export function emptyStreak(): StreakState {
  return { current: 0, best: 0, lastDay: "", freezes: 0 };
}

/**
 * 今天有学习行为时推进 streak。
 * gap=0 同一天重复学,不变;gap=1 正常 +1;
 * gap=2 且有冻结:消耗一枚,视作没断;更久或没冻结:归 1 重开。
 */
export function advanceStreak(
  state: StreakState,
  today: string,
): StreakAdvance {
  if (!state.lastDay) {
    const current = 1;
    return {
      current,
      best: Math.max(state.best, current),
      lastDay: today,
      freezes: state.freezes,
      usedFreeze: false,
      changed: true,
    };
  }
  const gap = diffDays(state.lastDay, today);
  if (gap <= 0) {
    // 同一天(或时钟回拨)——不动
    return { ...state, usedFreeze: false, changed: false };
  }
  if (gap === 1) {
    const current = state.current + 1;
    return {
      current,
      best: Math.max(state.best, current),
      lastDay: today,
      freezes: state.freezes,
      usedFreeze: false,
      changed: true,
    };
  }
  if (gap === 2 && state.freezes > 0) {
    // 昨天没学,但冻结顶上了
    const current = state.current + 1;
    return {
      current,
      best: Math.max(state.best, current),
      lastDay: today,
      freezes: state.freezes - 1,
      usedFreeze: true,
      changed: true,
    };
  }
  return {
    current: 1,
    best: Math.max(state.best, 1),
    lastDay: today,
    freezes: state.freezes,
    usedFreeze: false,
    changed: true,
  };
}
