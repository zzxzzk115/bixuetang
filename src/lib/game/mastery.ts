// 掌握度:从间隔重复的卡片状态派生「这门课真正记住了多少」。纯函数、无 I/O。
//
// 一张卡熬过「周间隔」(intervalDays≥7)才算真正记住——它已经在遗忘拐点后
// 至少答对过 3 次(1→3→7 天阶梯)。掌握度 = 已掌握卡 / 总卡。这是 outcome
// 信号:量的是长期留存,不是看了多久。

/** 间隔达到这个天数(周间隔)视为「已掌握」 */
export const MASTERED_INTERVAL = 7;

/** 一组卡的掌握度百分比;没有卡返回 null(还没复习过,不显示) */
export function masteryPct(cards: { intervalDays: number }[]): number | null {
  if (cards.length === 0) return null;
  const mastered = cards.filter(
    (c) => c.intervalDays >= MASTERED_INTERVAL,
  ).length;
  return Math.round((100 * mastered) / cards.length);
}
