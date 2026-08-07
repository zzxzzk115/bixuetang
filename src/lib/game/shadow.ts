import "server-only";

// 影子跟读的纯常量/派生(非 "use server",可被 server action 与 bootstrap 复用)。

/** 练完一个跟读单元的基础 XP */
export const SHADOW_XP = 30;

/** 一条跟读线里,单元按顺序线性解锁:前一个练完才开下一个 */
export function shadowUnlocked(doneIds: Set<string>, orderedIds: string[]) {
  const unlocked = new Set<string>();
  for (let i = 0; i < orderedIds.length; i++) {
    if (i === 0 || doneIds.has(orderedIds[i - 1])) unlocked.add(orderedIds[i]);
  }
  return unlocked;
}
