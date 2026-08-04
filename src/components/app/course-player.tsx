"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Episode, Source } from "@/lib/content/schema";
import { SEEK_EVENT, type SeekRequest } from "@/lib/seek";
import { EmbedPlayer } from "../embed-player";
import { BiliInteract } from "./bili-interact";
import { BiliPlayer } from "./bili-player";

// 播放区：B 站源用自研播放器（弹幕 + 真实观看进度），
// 其他平台（YouTube 等）回退到原来的嵌入播放器。
// 知识点地图点时间戳会派 SEEK_EVENT，这里接住并切集/跳转。

function bvidOf(url: string): string | null {
  return url.match(/\/video\/(BV[0-9A-Za-z]+)/)?.[1] ?? null;
}

export function CoursePlayer({
  courseId,
  sources,
  courseTitle,
  episodes,
  initialEpisode,
  resumeByEpisode,
}: {
  courseId: string;
  sources: Source[];
  courseTitle: string;
  episodes: Episode[];
  initialEpisode: number;
  resumeByEpisode: Record<number, { positionSec: number; ratioPct: number }>;
}) {
  const router = useRouter();
  const [episodeN, setEpisodeN] = useState(initialEpisode);
  const [aid, setAid] = useState<number | null>(null);
  const onLoaded = useCallback(
    (info: { aid: number; cid: number }) => setAid(info.aid),
    [],
  );

  useEffect(() => {
    const onSeek = (event: Event) => {
      const request = (event as CustomEvent<SeekRequest>).detail;
      if (request.page) setEpisodeN(request.page);
    };
    window.addEventListener(SEEK_EVENT, onSeek);
    return () => window.removeEventListener(SEEK_EVENT, onSeek);
  }, []);

  const biliSource = sources.find((s) => s.platform === "bilibili");
  const episode = episodes.find((e) => e.n === episodeN) ?? episodes[0];
  // 合集课每集是独立稿件（episodes[].bvid）；多分 P 课共用稿件 bvid + page
  const bvid = episode?.bvid ?? (biliSource ? bvidOf(biliSource.url) : null);
  const page = episode?.bvid ? 1 : (episode?.n ?? 1);

  if (!biliSource || !bvid || !episode) {
    return (
      <EmbedPlayer
        sources={sources}
        courseTitle={courseTitle}
        episodes={episodes}
      />
    );
  }

  return (
    <div className="course-player-native">
      <div className="course-player-head">
        <b>
          第 {episode.n} 集 · {episode.title}
        </b>
        {resumeByEpisode[episode.n]?.ratioPct ? (
          <small>已看 {resumeByEpisode[episode.n].ratioPct}%</small>
        ) : null}
      </div>
      <BiliPlayer
        key={`${bvid}:${page}`}
        bvid={bvid}
        page={page}
        courseId={courseId}
        episodeN={episode.n}
        resumeAt={resumeByEpisode[episode.n]?.positionSec ?? 0}
        onCompleted={() => router.refresh()}
        onLoaded={onLoaded}
      />
      <BiliInteract key={`i:${bvid}:${page}`} bvid={bvid} aid={aid} page={page} />
    </div>
  );
}
