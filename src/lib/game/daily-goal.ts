// 每日目标(多邻国式):今天挣够 N 点经验就达成。指标 = 当日(UTC+8)xp_events 之和。
// 纯常量与类型,客户端与服务端共用;取数逻辑在 daily-goal-query.ts(server-only)。

export const GOAL_OPTIONS = [20, 50, 100, 200] as const;
export const GOAL_LABEL: Record<number, string> = {
  20: "轻松",
  50: "常规",
  100: "认真",
  200: "硬核",
};

export interface DailyProgress {
  goal: number;
  todayXp: number;
  pct: number;
  met: boolean;
}
