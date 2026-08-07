import "server-only";

// 影子跟读单元的「节点轨道」:把单元的句子切成若干段,每段=一个跟读节点,
// 段末挂一个宝箱。跟课程的 lesson-track(看视频/答题/宝箱)是一套心智模型:
// 单元=一个范围(横幅),范围里是一串节点,线性推进。

/** 每个跟读节点覆盖多少句 */
export const SHADOW_SEG_SIZE = 6;

export interface ShadowTrackNode {
  kind: "practice" | "chest";
  /** 单元内顺序序号(0-based),practice 与 chest 连续编号,作节点 key */
  index: number;
  /** practice: 段序号(0-based,即幂等键里的 seg);chest: -1 */
  seg: number;
  /** practice: 句子闭区间 [from,to];chest: [-1,-1] */
  from: number;
  to: number;
}

/** 把 sentenceCount 句切成段;尾段仅 1 句则并进上一段,免得节点只练一句 */
export function shadowSegments(sentenceCount: number): { from: number; to: number }[] {
  const segs: { from: number; to: number }[] = [];
  for (let i = 0; i < sentenceCount; i += SHADOW_SEG_SIZE) {
    segs.push({ from: i, to: Math.min(sentenceCount - 1, i + SHADOW_SEG_SIZE - 1) });
  }
  if (segs.length >= 2) {
    const last = segs[segs.length - 1];
    if (last.to - last.from + 1 <= 1) {
      segs[segs.length - 2].to = last.to;
      segs.pop();
    }
  }
  return segs.length ? segs : [{ from: 0, to: Math.max(0, sentenceCount - 1) }];
}

/** 段数(= practice 节点数) */
export function shadowSegCount(sentenceCount: number): number {
  return shadowSegments(sentenceCount).length;
}

/** 单元轨道:若干 practice 节点 + 末尾一个 chest 节点 */
export function buildShadowTrack(sentenceCount: number): ShadowTrackNode[] {
  const segs = shadowSegments(sentenceCount);
  const nodes: ShadowTrackNode[] = segs.map((s, seg) => ({
    kind: "practice",
    index: seg,
    seg,
    from: s.from,
    to: s.to,
  }));
  nodes.push({ kind: "chest", index: nodes.length, seg: -1, from: -1, to: -1 });
  return nodes;
}
