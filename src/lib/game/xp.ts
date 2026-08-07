import { LEVEL_FACTOR, type Level } from "../content/schema";

// XP 数值规则（纯函数）。写入侧靠 xp_events 的 (user, reason, ref) 唯一约束幂等。
//
// 设计（用户拍板）：单集完成给固定底分，再按该集视频时长小幅加成，
// 结果一律取 10 的倍数——玩家看到的永远是整十数，好预期、好算账。

/** 默认时长（分集数据没拉到时长时按 15 分钟算） */
export const DEFAULT_EPISODE_MINUTES = 15;

/** 难度底分：基础 10 / 进阶 20 / 高阶 30 */
const LEVEL_BASE: Record<Level, number> = {
  basic: 10,
  intermediate: 20,
  advanced: 30,
};

/** 时长加成：每满 20 分钟 +10，封顶 +30（不喧宾夺主） */
export function durationBonus(durationSec?: number): number {
  const minutes = durationSec ? durationSec / 60 : DEFAULT_EPISODE_MINUTES;
  return Math.min(30, Math.floor(minutes / 20) * 10);
}

/** 看完一集：底分 + 时长加成，10 的倍数（10~60） */
export function episodeXp(level: Level, durationSec?: number): number {
  return LEVEL_BASE[level] + durationBonus(durationSec);
}

/** 加成后的实际入账值，同样取整到 10 */
export function boostedXp(base: number, multiplierPct: number): number {
  return Math.round((base * multiplierPct) / 100 / 10) * 10;
}

/** 整课通关（Boss 击杀）结算加成：集数 × 5 × 难度系数，取整到 10 */
export function courseBonusXp(episodeCount: number, level: Level): number {
  return Math.round((episodeCount * 5 * LEVEL_FACTOR[level]) / 10) * 10;
}

export const XP_REASON = {
  episode: "episode",
  courseDone: "course-done",
  labTask: "lab-task",
  /** 长视频章节(分段)阶段性结算——目标梯度:大目标拆成小里程碑 */
  segment: "segment",
  /** 影子跟读:练完一个单元 */
  shadow: "shadow",
} as const;

/** 影子跟读单元的幂等键 */
export function shadowRef(unitId: string): string {
  return `shadow:${unitId}`;
}

/** 幂等键 */
export function episodeRef(courseId: string, n: number): string {
  return `${courseId}:ep:${n}`;
}

export function segmentRef(courseId: string, n: number, idx: number): string {
  return `${courseId}:seg:${n}:${idx}`;
}

/** 某集全部章节事件的 ref 前缀(整集补差时汇总已发放额度用) */
export function segmentRefPrefix(courseId: string, n: number): string {
  return `${courseId}:seg:${n}:`;
}

/**
 * 单个章节的 XP 份额:整集 XP 均摊到各段,取整到 5、下限 5。
 * 整集完成时只补「整集 XP − 已发章节 XP」的差额,总量不膨胀。
 */
export function segmentXpShare(episodeTotal: number, segmentCount: number): number {
  if (segmentCount <= 0) return 0;
  return Math.max(5, Math.round(episodeTotal / segmentCount / 5) * 5);
}
