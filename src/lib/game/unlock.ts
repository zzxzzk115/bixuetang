// 课程解锁规则。
//
// 前置课没学就跳到后续课，看得懂才怪——地图上把它锁住比让人一头雾水强。
// 门槛就是**学完**：前置课学一半就放行，等于承认那门课有一半可以不学，
// 那这条前置关系本身也就没意义了。真正该解决的是「地基线够不够多」，
// 而不是把门槛调松（见 content/paths 的 tier 分层）。

/** 前置课完成度达到这个比例才算过关——就是全部学完 */
export const UNLOCK_RATIO = 1;

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

/**
 * 「去解锁」该跳到哪门课。
 *
 * 直接跳到缺的那门前置往往还是锁着的——实测 116 门课里只有 8 门没有前置，
 * 大多数课的前置链有两三层深。所以沿链一路往下找，返回**第一门现在就能学**
 * 的课，让「去解锁」点一次就落到能开始的地方。
 *
 * 找不到（整条链都锁着，通常意味着内容里的前置关系有环）时返回 null。
 */
export function unlockEntry(
  courseId: string,
  courses: CourseUnlockInput[],
): string | null {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const states = computeUnlocks(courses);
  // 自己就能学，不需要什么入口
  if (states.get(courseId)?.unlocked) return null;

  // 广度优先：同一层里先撞上的那门更浅，学起来更快
  const queue = [courseId];
  const seen = new Set([courseId]);
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (id !== courseId && states.get(id)?.unlocked) return id;
    for (const p of byId.get(id)?.prerequisites ?? []) {
      if (!byId.has(p) || seen.has(p)) continue;
      seen.add(p);
      queue.push(p);
    }
  }
  return null;
}
