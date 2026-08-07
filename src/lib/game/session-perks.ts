// 四维 + 等级 → 答题玩法参数（纯函数，服务端出题与背包页效果预览共用）。
// 装备遗物加四维，这里就是「道具效果」的落点：
//   专注 → 每题限时    洞察 → 「排除一项」提示次数
//   意志 → 试炼生命    精准 → 快答窗口（快答有额外 XP）
// 生命上限还随等级成长（每 5 级 +1，封顶 8）——练得久，血条也更长；
// 护盾血（以撒式蓝心）在试炼里先于红心被扣、用完即消，来自学习掉落。

/** 生命上限封顶 */
export const MAX_HEARTS = 8;

export interface SessionPerks {
  /** 逐题限时（秒）：15 + 专注/2，封顶 40 */
  timeLimitSec: number;
  /** 「排除一项」提示次数：洞察/10，封顶 3 */
  hints: number;
  /** 试炼生命（红心上限）：3 + 意志/15 + 等级/5，封顶 8 */
  hearts: number;
  /** 护盾血（蓝心）：先于红心消耗、用完即消、不占上限 */
  shieldHearts: number;
  /** 快答窗口（限时的前百分之几内答对算快答）：0.35 + 精准/200，封顶 0.6 */
  fastRatio: number;
}

export function sessionPerks(
  stats: {
    insight: number;
    focus: number;
    precision: number;
    resolve: number;
  },
  opts: { level?: number; shieldHearts?: number } = {},
): SessionPerks {
  const level = opts.level ?? 0;
  return {
    timeLimitSec: Math.min(40, Math.max(15, Math.round(15 + stats.focus * 0.5))),
    hints: Math.min(3, Math.floor(stats.insight / 10)),
    hearts: Math.min(
      MAX_HEARTS,
      3 + Math.floor(stats.resolve / 15) + Math.floor(level / 5),
    ),
    shieldHearts: Math.max(0, opts.shieldHearts ?? 0),
    fastRatio: Math.min(0.6, 0.35 + stats.precision / 200),
  };
}
