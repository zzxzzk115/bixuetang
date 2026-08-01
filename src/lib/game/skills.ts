import type { SkillNode, Subject } from "../content/schema";
import { SUBJECTS } from "../content/schema";

// 技能树点亮规则（纯函数）：
// 可点亮 = requires 全部已点亮 且 关联课程按 rule 满足；
// 实际点亮还需手动花费 cost 技能点（写 skill_unlocks），由调用方判断余额。

export type SkillState = "locked" | "available" | "lit";

export interface SkillView {
  node: SkillNode;
  state: SkillState;
  /** 课程条件是否满足 */
  coursesMet: boolean;
  /** 前置节点是否全部点亮 */
  requiresMet: boolean;
}

export function coursesMet(node: SkillNode, doneCourses: Set<string>): boolean {
  return node.rule === "all"
    ? node.courses.every((c) => doneCourses.has(c))
    : node.courses.some((c) => doneCourses.has(c));
}

export function computeSkillViews(
  nodes: SkillNode[],
  doneCourses: Set<string>,
  lit: Set<string>,
): SkillView[] {
  return nodes.map((node) => {
    const cm = coursesMet(node, doneCourses);
    const rm = node.requires.every((r) => lit.has(r));
    const state: SkillState = lit.has(node.id)
      ? "lit"
      : cm && rm
        ? "available"
        : "locked";
    return { node, state, coursesMet: cm, requiresMet: rm };
  });
}

/** 已花费的技能点 = 已点亮节点的 cost 之和 */
export function spentPoints(nodes: SkillNode[], lit: Set<string>): number {
  return nodes.reduce((sum, n) => (lit.has(n.id) ? sum + n.cost : sum), 0);
}

/** 四维修为：每点亮一个该学科节点 +tier 点 */
export function subjectStats(
  nodes: SkillNode[],
  lit: Set<string>,
): Record<Subject, number> {
  const stats = Object.fromEntries(SUBJECTS.map((s) => [s, 0])) as Record<
    Subject,
    number
  >;
  for (const n of nodes) {
    if (lit.has(n.id)) stats[n.subject] += n.tier;
  }
  return stats;
}
