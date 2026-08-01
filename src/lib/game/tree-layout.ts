import type { SkillNode, Subject } from "../content/schema";
import { SUBJECTS } from "../content/schema";

// 技能树静态分层布局（纯函数）：
// 学科分列（列宽 = 该学科同层最多节点数），tier 自上而下分行。
// 输出绝对坐标，SVG 连线与 HTML 节点卡共用。

export const NODE_W = 208;
export const NODE_H = 92;
const SLOT_GAP = 16;
const COL_GAP = 36;
const ROW_H = 168;
const TOP_PAD = 44; // 学科标题行

export interface LaidOutNode {
  node: SkillNode;
  x: number;
  y: number;
}

export interface TreeLayout {
  nodes: LaidOutNode[];
  /** 学科列标题位置 */
  columns: { subject: Subject; x: number; width: number }[];
  edges: { from: string; to: string }[];
  width: number;
  height: number;
}

export function layoutTree(nodes: SkillNode[]): TreeLayout {
  const bySubject = new Map<Subject, SkillNode[]>();
  for (const s of SUBJECTS) bySubject.set(s, []);
  for (const n of nodes) bySubject.get(n.subject)?.push(n);

  const maxTier = Math.max(1, ...nodes.map((n) => n.tier));
  const laid: LaidOutNode[] = [];
  const columns: TreeLayout["columns"] = [];
  let x = 0;

  for (const subject of SUBJECTS) {
    const subjectNodes = bySubject.get(subject)!;
    if (subjectNodes.length === 0) continue;
    const maxSlots = Math.max(
      1,
      ...Array.from({ length: maxTier }, (_, t) =>
        subjectNodes.filter((n) => n.tier === t + 1).length,
      ),
    );
    const colWidth = maxSlots * NODE_W + (maxSlots - 1) * SLOT_GAP;

    for (let tier = 1; tier <= maxTier; tier++) {
      const row = subjectNodes
        .filter((n) => n.tier === tier)
        .sort((a, b) => a.id.localeCompare(b.id));
      // 行内居中排槽位
      const rowWidth = row.length * NODE_W + (row.length - 1) * SLOT_GAP;
      const startX = x + (colWidth - rowWidth) / 2;
      row.forEach((node, i) => {
        laid.push({
          node,
          x: startX + i * (NODE_W + SLOT_GAP),
          y: TOP_PAD + (tier - 1) * ROW_H,
        });
      });
    }

    columns.push({ subject, x, width: colWidth });
    x += colWidth + COL_GAP;
  }

  const edges = nodes.flatMap((n) =>
    n.requires.map((from) => ({ from, to: n.id })),
  );

  return {
    nodes: laid,
    columns,
    edges,
    width: Math.max(0, x - COL_GAP),
    height: TOP_PAD + (maxTier - 1) * ROW_H + NODE_H + 8,
  };
}
