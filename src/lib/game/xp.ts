import { LEVEL_FACTOR, type Level } from "../content/schema";

// XP 数值规则（纯函数）。写入侧靠 xp_events 的 (user, reason, ref) 唯一约束幂等。

/** 看完一集（击败小怪）：10 × 难度系数 */
export function episodeXp(level: Level): number {
  return Math.round(10 * LEVEL_FACTOR[level]);
}

/** 整课通关（Boss 击杀）结算加成：集数 × 5 × 难度系数 */
export function courseBonusXp(episodeCount: number, level: Level): number {
  return Math.round(episodeCount * 5 * LEVEL_FACTOR[level]);
}

export const XP_REASON = {
  episode: "episode",
  courseDone: "course-done",
  labTask: "lab-task",
} as const;

/** 幂等键 */
export function episodeRef(courseId: string, n: number): string {
  return `${courseId}:ep:${n}`;
}
