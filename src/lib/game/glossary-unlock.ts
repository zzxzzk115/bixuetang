// 卷宗解锁：术语跟着「看过的集」走，而不是跟着课程走。
//
// 没接触过的知识点，就算把释义摆出来也是模糊的；而且术语条目要能点回
// 具体某一集，没看过的集列在出处里只会是死链。
//
// 同一个术语常常在好几门课、好几集里都出现过——那就只标注**已经看过的**
// 那些出处，其余的等看到了再冒出来。

export interface TermSource {
  courseId: string;
  courseTitle: string;
  /** 讲到这个词的集 */
  episodes: number[];
}

export interface TermRecord {
  term: string;
  definitions: string[];
  sources: TermSource[];
}

export interface TermInput {
  courseId: string;
  courseTitle: string;
  episodeN: number;
  term: string;
  definition: string;
}

/** courseId → 已看过的集号 */
export type WatchedMap = Map<string, Set<number>>;

function isWatched(watched: WatchedMap, courseId: string, n: number): boolean {
  return watched.get(courseId)?.has(n) ?? false;
}

/**
 * 汇总已解锁的术语。
 * 只保留至少有一处出自已看过的集的词条，且每条只列已看过的出处。
 */
export function unlockedTerms(
  inputs: TermInput[],
  watched: WatchedMap,
): TermRecord[] {
  const byKey = new Map<string, TermRecord>();

  for (const item of inputs) {
    if (!isWatched(watched, item.courseId, item.episodeN)) continue;
    const key = item.term.trim().toLowerCase();
    if (!key) continue;

    let record = byKey.get(key);
    if (!record) {
      record = { term: item.term.trim(), definitions: [], sources: [] };
      byKey.set(key, record);
    }
    if (item.definition && !record.definitions.includes(item.definition)) {
      record.definitions.push(item.definition);
    }
    let source = record.sources.find((s) => s.courseId === item.courseId);
    if (!source) {
      source = {
        courseId: item.courseId,
        courseTitle: item.courseTitle,
        episodes: [],
      };
      record.sources.push(source);
    }
    if (!source.episodes.includes(item.episodeN)) {
      source.episodes.push(item.episodeN);
      source.episodes.sort((a, b) => a - b);
    }
  }

  return [...byKey.values()].sort((a, b) =>
    a.term.localeCompare(b.term, "en", { sensitivity: "base" }),
  );
}

/**
 * 看完某一集**新**解锁了哪些术语——即这一集讲到、而在别处都还没看到过的词。
 * 用来在打卡后弹「解锁了 N 个新词条」。
 *
 * `watchedBefore` 是这一集打卡**之前**的观看集合。
 */
export function newlyUnlocked(
  inputs: TermInput[],
  watchedBefore: WatchedMap,
  courseId: string,
  episodeN: number,
): { term: string; definition: string }[] {
  const already = new Set(
    inputs
      .filter((i) => isWatched(watchedBefore, i.courseId, i.episodeN))
      .map((i) => i.term.trim().toLowerCase()),
  );

  const out: { term: string; definition: string }[] = [];
  const seen = new Set<string>();
  for (const item of inputs) {
    if (item.courseId !== courseId || item.episodeN !== episodeN) continue;
    const key = item.term.trim().toLowerCase();
    if (!key || already.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ term: item.term.trim(), definition: item.definition });
  }
  return out;
}
