import type { SkillNode, Subject } from "../content/schema";
import { SUBJECTS } from "../content/schema";

// 放射状技能树（纯函数）：像 MMORPG 天赋盘那样从中心向外发散。
// 学科各占一个扇区（角度按节点数分配，CS 多就占得宽），tier 决定圈层半径。
// 输出绝对坐标，SVG 连线与 HTML 节点卡共用。
//
// 关于间距：节点卡是轴对齐矩形，但排布在圆周上。在圆盘顶部/底部相邻节点横向并排
// （需要 NODE_W 的间隔），在左右两侧则是纵向堆叠（只需 NODE_H）。为了不做方向判断，
// 圆周间距与圈层间距统一按最坏情况 NODE_W 取，宁可画布大一点也不让卡片压盖。

export const NODE_W = 132;
export const NODE_H = 50;
/** 中心徽记半径 */
export const HUB_R = 46;

const SEP = NODE_W + 16; // 节点之间的安全间距（圆周方向与半径方向共用）
const RING_BASE = 200; // 第一圈的最小半径
const SECTOR_GAP = 0.08; // 扇区之间留白占比
const PAD = NODE_W / 2 + 34; // 画布留白，防止节点卡与扇区标签出界

/** 服务端与浏览器的 Math.cos/sin 末位可能不同，取整后再序列化，避免水合不匹配 */
const round = (n: number) => Math.round(n * 100) / 100;

export interface LaidOutNode {
  node: SkillNode;
  /** 节点中心坐标 */
  x: number;
  y: number;
  /** 极角（弧度），连线用 */
  angle: number;
  radius: number;
}

export interface TreeLayout {
  nodes: LaidOutNode[];
  /** 学科扇区标签位置（在最外圈之外） */
  sectors: { subject: Subject; x: number; y: number; midAngle: number }[];
  /** 各 tier 的半径，画背景同心圆用 */
  rings: number[];
  edges: { from: string; to: string }[];
  center: { x: number; y: number };
  width: number;
  height: number;
}

export function layoutTree(nodes: SkillNode[]): TreeLayout {
  const present = SUBJECTS.filter((s) => nodes.some((n) => n.subject === s));
  const maxTier = Math.max(1, ...nodes.map((n) => n.tier));

  // 扇区角度按学科的节点数分配——节点多的学科分到更宽的角度
  const sectors: { subject: Subject; start: number; end: number }[] = [];
  let cursor = -Math.PI / 2;
  for (const subject of present) {
    const count = nodes.filter((n) => n.subject === subject).length;
    const span = (Math.PI * 2 * count) / nodes.length;
    const gap = span * SECTOR_GAP;
    sectors.push({
      subject,
      start: cursor + gap / 2,
      end: cursor + span - gap / 2,
    });
    cursor += span;
  }

  const group = (subject: Subject, tier: number) =>
    nodes
      .filter((n) => n.subject === subject && n.tier === tier)
      .sort((a, b) => a.id.localeCompare(b.id));

  // 每层半径同时满足两个下限：比上一层外扩一格，且宽到能让最挤的扇区单圈排开
  const rings: number[] = [];
  for (let tier = 1; tier <= maxTier; tier++) {
    const needed = Math.max(
      ...sectors.map((s) => {
        const n = group(s.subject, tier).length;
        return n === 0 ? 0 : (n * SEP) / (s.end - s.start);
      }),
    );
    const floorR = tier === 1 ? RING_BASE : rings[tier - 2] + SEP;
    rings.push(Math.max(floorR, Math.ceil(needed)));
  }

  const outermost = rings[rings.length - 1];
  const size = (outermost + PAD) * 2;
  const c = size / 2;

  const laid: LaidOutNode[] = [];
  for (let tier = 1; tier <= maxTier; tier++) {
    const radius = rings[tier - 1];
    for (const s of sectors) {
      const row = group(s.subject, tier);
      if (row.length === 0) continue;
      const arc = s.end - s.start;
      row.forEach((node, i) => {
        // 单个节点摆在扇区中线，多个则在扇区内等分（两端各留半格）
        const t = row.length === 1 ? 0.5 : (i + 0.5) / row.length;
        const angle = s.start + arc * t;
        laid.push({
          node,
          x: round(c + Math.cos(angle) * radius),
          y: round(c + Math.sin(angle) * radius),
          angle: round(angle),
          radius,
        });
      });
    }
  }

  const sectorLabels = sectors.map((s) => {
    const midAngle = (s.start + s.end) / 2;
    return {
      subject: s.subject,
      x: round(c + Math.cos(midAngle) * (outermost + PAD * 0.66)),
      y: round(c + Math.sin(midAngle) * (outermost + PAD * 0.66)),
      midAngle: round(midAngle),
    };
  });

  const edges = nodes.flatMap((n) =>
    n.requires.map((from) => ({ from, to: n.id })),
  );

  return {
    nodes: laid,
    sectors: sectorLabels,
    rings,
    edges,
    center: { x: c, y: c },
    width: size,
    height: size,
  };
}
