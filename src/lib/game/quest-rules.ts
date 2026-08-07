export const FOCUS_REWARD_MINUTES = 10;
export const SUMMARY_MIN_LENGTH = 12;

/**
 * 每日任务三件套,对应站内现役玩法:
 *   watch  看完 1 集(核心学习行为)
 *   review 完成今日复习(间隔重复,巩固记忆)
 *   trial  打 1 场试炼/对战(测试效应 + 变着花样练)
 * (旧的 focus/checkpoint 任务依赖已下线的远征计时器与复述面板,
 *  挂出来也完不成,一并退役。)
 */
export type QuestKind = "watch" | "review" | "trial";

export interface QuestEvidence {
  watchedToday: boolean;
  reviewDone: boolean;
  trialDone: boolean;
}

export function normalizeFocusMinutes(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(120, Math.round(value)));
}

export function isSummaryEvidence(summary: string): boolean {
  return summary.trim().length >= SUMMARY_MIN_LENGTH;
}

export function questIsComplete(
  kind: QuestKind,
  evidence: QuestEvidence,
): boolean {
  if (kind === "watch") return evidence.watchedToday;
  if (kind === "review") return evidence.reviewDone;
  return evidence.trialDone;
}
