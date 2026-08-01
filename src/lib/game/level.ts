// 等级曲线：从 1 级升到 n+1 级，累计需要 50·n·(n+1) XP。
// 1→2 级 100 XP，2→3 级再 200 XP……早期升级快，MMORPG 手感。
// 纯函数、无 I/O：总 XP 永远由 xp_events 流水求和推导，等级由本文件推导。

/** 达到 level 级所需的累计 XP（level=1 → 0） */
export function totalXpForLevel(level: number): number {
  return 50 * (level - 1) * level;
}

/** 由累计 XP 推导当前等级 */
export function levelFromXp(xp: number): number {
  if (xp <= 0) return 1;
  // 解 50·(L-1)·L <= xp 的最大 L
  let level = Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2);
  while (totalXpForLevel(level + 1) <= xp) level++;
  while (level > 1 && totalXpForLevel(level) > xp) level--;
  return Math.max(1, level);
}

export interface LevelProgress {
  level: number;
  /** 当前等级内已获得的 XP */
  current: number;
  /** 升到下一级还需要的这一段总量 */
  span: number;
  /** 0..1 */
  ratio: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelFromXp(xp);
  const floor = totalXpForLevel(level);
  const ceil = totalXpForLevel(level + 1);
  const span = ceil - floor;
  const current = xp - floor;
  return { level, current, span, ratio: span === 0 ? 0 : current / span };
}

/** 每升 1 级获得 1 技能点 */
export function skillPointsEarned(level: number): number {
  return Math.max(0, level - 1);
}
