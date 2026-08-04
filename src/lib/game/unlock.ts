// 课程解锁规则。
//
// 前置课没学就跳到后续课，看得懂才怪——地图上把它锁住比让人一头雾水强。
// 但也不能锁死：要求前置 100% 通关会让绝大多数人卡在第二门课，
// 所以门槛设在「过半」，够建立基础就放行。

/** 前置课完成度达到这个比例即视为「打过底了」 */
export const UNLOCK_RATIO = 0.5;

export interface CourseUnlockInput {
  id: string;
  prerequisites: string[];
  episodeCount: number;
  watchedCount: number;
  /** 课程整体状态，done 直接算满 */
  done: boolean;
}

export interface UnlockState {
  unlocked: boolean;
  /** 还差哪几门前置课（已解锁的课这里是空的） */
  missing: string[];
}

/** 单门课的完成度 0~1 */
export function completionOf(c: CourseUnlockInput): number {
  if (c.done) return 1;
  if (c.episodeCount <= 0) return 0;
  return Math.min(1, c.watchedCount / c.episodeCount);
}

/**
 * 算出每门课的解锁状态。
 *
 * 规则：
 * 1. 没有前置的课永远开放——总得有地方入门；
 * 2. 有前置的课，要求每一门前置的完成度 ≥ UNLOCK_RATIO；
 * 3. 已经看过至少一集的课保持开放。规则或内容调整过后不该把学到
 *    一半的人重新锁在门外；
 * 4. 前置指向不存在的课程时忽略它，不然一个笔误能锁死一整条线。
 */
export function computeUnlocks(
  courses: CourseUnlockInput[],
): Map<string, UnlockState> {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const out = new Map<string, UnlockState>();

  for (const c of courses) {
    if (c.watchedCount > 0 || c.done) {
      out.set(c.id, { unlocked: true, missing: [] });
      continue;
    }
    const missing = c.prerequisites.filter((p) => {
      const prereq = byId.get(p);
      if (!prereq) return false;
      return completionOf(prereq) < UNLOCK_RATIO;
    });
    out.set(c.id, { unlocked: missing.length === 0, missing });
  }
  return out;
}

/** 解锁的课程 id 集合，给按解锁筛选的地方（卷宗索引等）用 */
export function unlockedCourseIds(courses: CourseUnlockInput[]): Set<string> {
  const states = computeUnlocks(courses);
  return new Set(
    [...states.entries()].filter(([, s]) => s.unlocked).map(([id]) => id),
  );
}
