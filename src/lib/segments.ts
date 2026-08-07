// 长视频分段(碎片化学习的骨架),纯函数。
//
// 一集 70 分钟的课不该是「一整块」:分段之后每段是一个可完成的小目标
// (目标梯度),通勤地铁上也能啃掉一段。段的边界优先用 UP 主标的章节
// (view_points),没有就用 AI 分析的关键点时间戳,再没有就按 10 分钟等分。

export interface Segment {
  idx: number;
  title: string;
  /** 起止秒(左闭右开) */
  from: number;
  to: number;
}

export interface SegmentSourcePoint {
  /** 起始秒 */
  t: number;
  title: string;
}

/** 关键点作边界时,相邻边界近于此值(秒)就合并——太碎不成「段」 */
const MERGE_GAP = 120;
/** 等分兜底的段长(秒) */
const BUCKET = 600;
/** 尾段短于此值(秒)并入前一段 */
const MIN_TAIL = 180;
/** 短视频不分段:本身就是一口气的量 */
const MIN_DURATION = 25 * 60;

export function buildSegments({
  durationSec,
  viewPoints = [],
  keyPoints = [],
}: {
  durationSec: number;
  /** UP 主标的章节(from/to 完整) */
  viewPoints?: { content: string; from: number; to: number }[];
  /** AI 分析的关键点(只有起始秒) */
  keyPoints?: SegmentSourcePoint[];
}): Segment[] {
  if (!Number.isFinite(durationSec) || durationSec < MIN_DURATION) return [];

  // 1) 章节优先:UP 主亲手标的,边界与标题都最可靠
  const vps = viewPoints
    .filter((p) => p.from >= 0 && p.to > p.from && p.from < durationSec)
    .sort((a, b) => a.from - b.from);
  if (vps.length >= 2) {
    return vps.map((p, i) => ({
      idx: i,
      title: p.content,
      from: p.from,
      // 最后一段兜到片尾(章节数据偶尔盖不满全片)
      to: i === vps.length - 1 ? Math.max(p.to, durationSec) : p.to,
    }));
  }

  // 2) 关键点时间戳作边界(相邻太近合并)
  const kps = keyPoints
    .filter((p) => Number.isFinite(p.t) && p.t > 0 && p.t < durationSec)
    .sort((a, b) => a.t - b.t);
  const bounds: SegmentSourcePoint[] = [];
  for (const p of kps) {
    const last = bounds[bounds.length - 1];
    if (!last || p.t - last.t >= MERGE_GAP) bounds.push(p);
  }
  if (bounds.length >= 1) {
    const starts = [{ t: 0, title: "开场" }, ...bounds.filter((b) => b.t >= MERGE_GAP)];
    const segs = starts.map((s, i) => ({
      idx: i,
      title: s.title,
      from: s.t,
      to: i === starts.length - 1 ? durationSec : starts[i + 1].t,
    }));
    return mergeShortTail(segs, durationSec);
  }

  // 3) 等分兜底
  const count = Math.floor(durationSec / BUCKET);
  if (count < 2) return [];
  const segs: Segment[] = [];
  for (let i = 0; i < count; i++) {
    segs.push({
      idx: i,
      title: `第 ${i + 1} 段`,
      from: i * BUCKET,
      to: i === count - 1 ? durationSec : (i + 1) * BUCKET,
    });
  }
  return mergeShortTail(segs, durationSec);
}

function mergeShortTail(segs: Segment[], durationSec: number): Segment[] {
  if (segs.length >= 2) {
    const tail = segs[segs.length - 1];
    if (tail.to - tail.from < MIN_TAIL) {
      segs[segs.length - 2] = { ...segs[segs.length - 2], to: durationSec };
      segs.pop();
    }
  }
  return segs.map((s, i) => ({ ...s, idx: i }));
}

/**
 * 按「看过的秒集合」算各段覆盖率(×100 整数)。
 * 覆盖率而非进度点:跳着看也算,和整集的打卡口径一致。
 */
export function segmentCoverage(
  seenSeconds: Iterable<number>,
  segments: Segment[],
): number[] {
  if (segments.length === 0) return [];
  const counts = new Array(segments.length).fill(0);
  for (const sec of seenSeconds) {
    // 段是有序区间,线性找就够了(段数通常个位数)
    for (let i = 0; i < segments.length; i++) {
      if (sec >= segments[i].from && sec < segments[i].to) {
        counts[i]++;
        break;
      }
    }
  }
  return segments.map((s, i) => {
    const span = Math.max(1, s.to - s.from);
    return Math.min(100, Math.round((counts[i] / span) * 100));
  });
}

/** 两份覆盖率逐段取大(本地新看的 vs 库里累计的) */
export function mergeCoverage(a: number[], b: number[]): number[] {
  const len = Math.max(a.length, b.length);
  const out = new Array(len).fill(0);
  for (let i = 0; i < len; i++) out[i] = Math.max(a[i] ?? 0, b[i] ?? 0);
  return out;
}

/** 第一个没看完(<90%)的段;全看完返回 -1 */
export function firstUnfinishedSegment(coverage: number[]): number {
  for (let i = 0; i < coverage.length; i++) {
    if (coverage[i] < 90) return i;
  }
  return coverage.length > 0 ? -1 : 0;
}
