import "server-only";

import fs from "node:fs";
import path from "node:path";
import type { SubtitleTrack } from "../bili/api";

// 仓库自带字幕:content/subtitles/<courseId>/<n>.json。
// 来源通常是 yt-dlp 抓的官方 YouTube CC(bilibili 源无 CC 轨时的补充),
// 播放器把它并进字幕轨列表,用户可开关——哪怕只有英文也多一种选择。
// 入库前必须核对与 bilibili 源的时长逐集一致,否则时间轴是错的
// (流程见 CONTRIBUTING.md「字幕与时间戳」)。

interface RepoSubtitleFile {
  lan: string;
  lanDoc: string;
  ai?: boolean;
  cues: { from: number; to: number; text: string }[];
}

const cache = globalThis as unknown as {
  __repoSubs?: Map<string, SubtitleTrack | null>;
};

export function loadRepoSubtitle(
  courseId: string,
  episodeN: number,
): SubtitleTrack | null {
  if (!cache.__repoSubs) cache.__repoSubs = new Map();
  const key = `${courseId}:${episodeN}`;
  const hit = cache.__repoSubs.get(key);
  if (hit !== undefined) return hit;

  let track: SubtitleTrack | null = null;
  try {
    const file = path.join(
      process.cwd(),
      "content",
      "subtitles",
      courseId,
      `${episodeN}.json`,
    );
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as RepoSubtitleFile;
      if (Array.isArray(raw.cues) && raw.cues.length > 0) {
        track = {
          lan: raw.lan,
          lanDoc: raw.lanDoc,
          cues: raw.cues,
          ai: raw.ai ?? false,
          suspect: false,
        };
      }
    }
  } catch {
    track = null;
  }
  cache.__repoSubs.set(key, track);
  return track;
}
