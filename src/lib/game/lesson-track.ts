// 课程 → 地图节点序列（多邻国式课程编排）。
// 一门课在地图上不再是单个节点，而是拆成「看视频 → 阶段测验 → 宝箱」的小节链：
//   - video：连续若干集打包成一个节点，全部看完即通过
//   - quiz：每两个视频节点后插一次阶段测验（覆盖上次测验以来的集数）；
//           课程结尾必有一次总复习测验（仅当该课有 AI 分析题库时才有 quiz）
//   - chest：长课程每 4 个视频节点后掉一个补给宝箱，课程结尾必有通关大宝箱
// 纯函数：客户端（地图渲染）与服务端（领奖校验）共用，保证两侧对「第 i 个
// 测验/宝箱覆盖哪些集」的理解永远一致——幂等 ref 就建立在这个共识上。

export type LessonNodeKind = "video" | "quiz" | "chest";

export interface LessonNode {
  kind: LessonNodeKind;
  /** 同 kind 内的序号（0 起），quiz/chest 的幂等 ref 用 `${courseId}:${index}` */
  index: number;
  /** 覆盖的集（episode 的 n 值，按课程顺序）。chest 表示领取前提，即此前全部集 */
  eps: number[];
}

/** 视频节点数：目标每节点 ~4 集，最少 1 个，最多 10 个（超长课每节点多塞几集） */
export function videoNodeCount(episodeCount: number): number {
  if (episodeCount <= 0) return 0;
  return Math.min(10, Math.max(1, Math.round(episodeCount / 4)));
}

/**
 * @param episodeNs 课程的集号列表（保持内容文件里的顺序）
 * @param hasQuiz   该课是否有可出题的分析题库（没有则不插测验节点）
 */
export function buildLessonTrack(
  episodeNs: number[],
  hasQuiz: boolean,
): LessonNode[] {
  const total = episodeNs.length;
  const nVideo = videoNodeCount(total);
  if (nVideo === 0) return [];

  // 把集数尽量均匀地切成 nVideo 段（前面的段多分余数）
  const base = Math.floor(total / nVideo);
  const extra = total % nVideo;
  const chunks: number[][] = [];
  let cursor = 0;
  for (let i = 0; i < nVideo; i++) {
    const size = base + (i < extra ? 1 : 0);
    chunks.push(episodeNs.slice(cursor, cursor + size));
    cursor += size;
  }

  const track: LessonNode[] = [];
  let quizIdx = 0;
  let chestIdx = 0;
  let quizFrom = 0; // 下一次测验覆盖的起始集下标（episodeNs 下标）
  let covered = 0; // 已进入 track 的集数

  chunks.forEach((eps, i) => {
    track.push({ kind: "video", index: i, eps });
    covered += eps.length;
    const isLast = i === nVideo - 1;

    // 阶段测验：每 2 个视频节点一次；结尾必有（总复习）
    if (hasQuiz && ((i + 1) % 2 === 0 || isLast)) {
      track.push({
        kind: "quiz",
        index: quizIdx++,
        eps: episodeNs.slice(quizFrom, covered),
      });
      quizFrom = covered;
    }

    // 补给宝箱：每 4 个视频节点一次（结尾的大宝箱单独加，避免贴脸两个）
    if (!isLast && (i + 1) % 4 === 0) {
      track.push({
        kind: "chest",
        index: chestIdx++,
        eps: episodeNs.slice(0, covered),
      });
    }
  });

  // 通关大宝箱：前提是全部集看完
  track.push({ kind: "chest", index: chestIdx, eps: [...episodeNs] });
  return track;
}

/** track 里某个 quiz/chest 节点；不存在返回 undefined（服务端校验用） */
export function findTrackNode(
  track: LessonNode[],
  kind: LessonNodeKind,
  index: number,
): LessonNode | undefined {
  return track.find((n) => n.kind === kind && n.index === index);
}
