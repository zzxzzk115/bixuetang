export const FOCUS_REWARD_MINUTES = 10;
export const SUMMARY_MIN_LENGTH = 12;

export type QuestKind = "encounter" | "focus" | "checkpoint";

export function normalizeFocusMinutes(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(120, Math.round(value)));
}

export function isSummaryEvidence(summary: string): boolean {
  return summary.trim().length >= SUMMARY_MIN_LENGTH;
}

export function questIsComplete(
  kind: QuestKind,
  evidence: { watched: boolean; focusMinutes: number; checkpointPassed: boolean },
  target: number,
): boolean {
  if (kind === "encounter") return evidence.watched;
  if (kind === "checkpoint") return evidence.checkpointPassed;
  return evidence.focusMinutes >= target;
}
