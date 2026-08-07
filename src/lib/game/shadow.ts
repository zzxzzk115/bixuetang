import "server-only";

// 影子跟读的纯常量/派生(非 "use server",可被 server action 与 bootstrap 复用)。

/** 练完一个跟读段(单元内一个跟读节点)的基础 XP */
export const SHADOW_SEG_XP = 20;
/** 跟读单元宝箱的奖励(整单元练完才开) */
export const SHADOW_CHEST_COINS = 40;
export const SHADOW_CHEST_XP = 15;

/** 一条跟读线里,单元按顺序线性解锁:前一个练完才开下一个 */
export function shadowUnlocked(doneIds: Set<string>, orderedIds: string[]) {
  const unlocked = new Set<string>();
  for (let i = 0; i < orderedIds.length; i++) {
    if (i === 0 || doneIds.has(orderedIds[i - 1])) unlocked.add(orderedIds[i]);
  }
  return unlocked;
}
