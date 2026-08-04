// 四维 → 答题玩法参数（纯函数，服务端出题与背包页效果预览共用）。
// 装备遗物加四维，这里就是「道具效果」的落点：
//   专注 → 每题限时    洞察 → 「排除一项」提示次数
//   意志 → 试炼生命    精准 → 快答窗口（快答有额外 XP）

export interface SessionPerks {
  /** 逐题限时（秒）：15 + 专注/2，封顶 40 */
  timeLimitSec: number;
  /** 「排除一项」提示次数：洞察/10，封顶 3 */
  hints: number;
  /** 试炼生命：3 + 意志/15，封顶 5 */
  hearts: number;
  /** 快答窗口（限时的前百分之几内答对算快答）：0.35 + 精准/200，封顶 0.6 */
  fastRatio: number;
}

export function sessionPerks(stats: {
  insight: number;
  focus: number;
  precision: number;
  resolve: number;
}): SessionPerks {
  return {
    timeLimitSec: Math.min(40, Math.max(15, Math.round(15 + stats.focus * 0.5))),
    hints: Math.min(3, Math.floor(stats.insight / 10)),
    hearts: Math.min(5, 3 + Math.floor(stats.resolve / 15)),
    fastRatio: Math.min(0.6, 0.35 + stats.precision / 200),
  };
}
