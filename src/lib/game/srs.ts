// 间隔重复调度(SM-2 简化版)。
//
// 心理学依据:
// · 间隔效应(spacing effect)——分散复习的记忆保持远好于集中重复;
// · 测试效应(testing effect)——主动回忆比重读有效,所以复习是答题不是浏览;
// · 艾宾浩斯遗忘曲线——间隔按 1/3/7/21 天铺开,恰好卡在遗忘拐点之前。
//
// 相比完整 SM-2 的简化:评分二值(对/错,适配四选一),ease 用 ×100 整数
// 存库(SQLite 无 decimal),前四次固定阶梯之后才进入 ease 乘法。

import { addDays } from "./day";

/** 固定阶梯(天):第 n 次答对后的间隔 */
export const INTERVALS = [1, 3, 7, 21] as const;

/** 间隔封顶一年:再长就没有「复习」的意义了,也防指数溢出 */
export const MAX_INTERVAL = 365;

export const EASE_START = 230; // 对应 SM-2 的 2.3
export const EASE_MIN = 130;
export const EASE_MAX = 280;
export const EASE_GAIN = 5; // 答对 +5
export const EASE_FAST_GAIN = 10; // 快答另加(答得快=记得牢)
export const EASE_LOSS = 20; // 答错 -20

export interface SrsCard {
  /** 当前间隔(天);0 = 新卡还没答对过 */
  intervalDays: number;
  /** ease ×100 整数 */
  ease: number;
  /** 连续答对次数(lapse 后清零) */
  reps: number;
  /** 累计答错次数 */
  lapses: number;
}

export interface SrsResult extends SrsCard {
  /** 下次到期日(dayKey 格式) */
  dueDay: string;
}

/**
 * 复习一张卡。today 为 dayKey;返回新状态与下次到期日。
 * 答错:间隔重置为 1 天,reps 清零(遗忘了就从头巩固,这是 SM-2 的立场)。
 */
export function schedule(
  card: SrsCard,
  grade: { correct: boolean; fast?: boolean },
  today: string,
): SrsResult {
  if (!grade.correct) {
    const ease = Math.max(EASE_MIN, card.ease - EASE_LOSS);
    return {
      intervalDays: 1,
      ease,
      reps: 0,
      lapses: card.lapses + 1,
      dueDay: addDays(today, 1),
    };
  }

  const ease = Math.min(
    EASE_MAX,
    card.ease + EASE_GAIN + (grade.fast ? EASE_FAST_GAIN : 0),
  );
  const reps = card.reps + 1;
  // 前四次走固定阶梯;之后 间隔 × ease
  const intervalDays = Math.min(
    MAX_INTERVAL,
    reps <= INTERVALS.length
      ? INTERVALS[reps - 1]
      : Math.max(
          card.intervalDays + 1,
          Math.round((card.intervalDays * ease) / 100),
        ),
  );
  return {
    intervalDays,
    ease,
    reps,
    lapses: card.lapses,
    dueDay: addDays(today, intervalDays),
  };
}

/** 新卡的初始状态(明天首次到期:当天刚学过,隔天开始考) */
export function newCard(): SrsCard {
  return { intervalDays: 0, ease: EASE_START, reps: 0, lapses: 0 };
}
