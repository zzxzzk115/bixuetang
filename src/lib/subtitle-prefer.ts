// 英文字幕轨优选(纯函数)。
//
// 背景:部分搬运稿件的 bilibili 英文轨残缺(如 missing-semester,
// 只覆盖开头几分钟或大段丢失),而仓库里有 yt-dlp 抓的 YouTube 官方 CC。
// 规则:两边都有英文轨时,比较「字幕覆盖的总秒数」——仓库轨完整度
// 超过 bilibili 轨一个阈值(1.2×),就丢弃 bilibili 英文轨,只留仓库轨;
// bilibili 英文轨是 AI/可疑轨而仓库轨是人工 CC 时无条件替换。
// 中文轨永不受影响。

export interface PreferableTrack {
  lan: string;
  ai: boolean;
  suspect: boolean;
  cues: { from: number; to: number; text: string }[];
}

/** 仓库轨完整度须超过 bilibili 轨的倍数,超过才值得替换 */
export const PREFER_THRESHOLD = 1.2;

/** 语言归一:仓库轨的 lan 带 yt- 前缀("yt-en"/"yt-en-auto") */
export function normalizeLan(lan: string): string {
  return lan.toLowerCase().replace(/^yt-/, "");
}

export function isEnglishLan(lan: string): boolean {
  return normalizeLan(lan).startsWith("en");
}

/** 字幕覆盖的总秒数(cue 区间求和;时间轴单调,不必做区间合并) */
export function coveredSeconds(
  cues: { from: number; to: number }[],
): number {
  let total = 0;
  for (const c of cues) total += Math.max(0, c.to - c.from);
  return total;
}

/**
 * 从 bilibili 轨列表里剔除该被仓库英文轨替换的英文轨。
 * 返回过滤后的 bilibili 轨(仓库轨由调用方追加,不在这里合并)。
 */
export function dropOutclassedEnglish<T extends PreferableTrack>(
  biliTracks: T[],
  repoTrack: PreferableTrack | null,
): T[] {
  if (!repoTrack || !isEnglishLan(repoTrack.lan)) return biliTracks;
  const repoCovered = coveredSeconds(repoTrack.cues);
  if (repoCovered <= 0) return biliTracks;

  return biliTracks.filter((t) => {
    if (!isEnglishLan(t.lan)) return true;
    // bilibili 英文轨是 AI/可疑而仓库是人工 CC → 无条件替换
    if ((t.ai || t.suspect) && !repoTrack.ai) return false;
    return coveredSeconds(t.cues) * PREFER_THRESHOLD >= repoCovered;
  });
}
