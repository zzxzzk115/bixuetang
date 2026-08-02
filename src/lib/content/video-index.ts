import { getContent } from "./load";

// 反查索引：平台视频 id → (课程, 集数)。
// 浏览器插件上报「我在看 BVxxx 的第 3 P」，靠这张表映射回课程进度。

export interface VideoHit {
  courseId: string;
  courseTitle: string;
  episodeN: number;
  episodeTitle: string;
}

interface VideoIndex {
  /** 合集类课程：每集独立稿件 → bvid 直接命中某一集 */
  byEpisodeVideo: Map<string, VideoHit>;
  /** 多分 P 课程：稿件 id → 课程（具体集数由上报的 page 决定） */
  byCourseVideo: Map<string, { courseId: string; courseTitle: string }>;
}

const globalForIndex = globalThis as unknown as { __guildVideoIndex?: VideoIndex };

function parseVideoIds(url: string): string[] {
  const ids: string[] = [];
  const bv = url.match(/\/video\/(BV[0-9A-Za-z]+)/)?.[1];
  if (bv) ids.push(bv.toLowerCase());
  const av = url.match(/\/video\/av(\d+)/)?.[1];
  if (av) ids.push(`av${av}`);
  const yt =
    url.match(/[?&]v=([\w-]+)/)?.[1] ?? url.match(/youtu\.be\/([\w-]+)/)?.[1];
  if (yt) ids.push(yt.toLowerCase());
  const list = url.match(/[?&]list=([\w-]+)/)?.[1];
  if (list) ids.push(list.toLowerCase());
  return ids;
}

function build(): VideoIndex {
  const content = getContent();
  const byEpisodeVideo = new Map<string, VideoHit>();
  const byCourseVideo = new Map<string, { courseId: string; courseTitle: string }>();

  for (const course of content.courses) {
    for (const s of course.sources) {
      for (const id of parseVideoIds(s.url)) {
        // 先登记的优先（同一视频被多门课引用时保守取第一门）
        if (!byCourseVideo.has(id)) {
          byCourseVideo.set(id, { courseId: course.id, courseTitle: course.title });
        }
      }
    }
    for (const ep of course.episodes) {
      if (!ep.bvid) continue;
      const key = ep.bvid.toLowerCase();
      if (!byEpisodeVideo.has(key)) {
        byEpisodeVideo.set(key, {
          courseId: course.id,
          courseTitle: course.title,
          episodeN: ep.n,
          episodeTitle: ep.title,
        });
      }
    }
  }
  return { byEpisodeVideo, byCourseVideo };
}

export function getVideoIndex(): VideoIndex {
  if (!globalForIndex.__guildVideoIndex) {
    globalForIndex.__guildVideoIndex = build();
  }
  return globalForIndex.__guildVideoIndex;
}

/**
 * 把插件上报的「视频 id + 分 P」解析成课程集数。
 * 合集课程按稿件 id 命中具体集；多分 P 课程用 page 作为集数。
 */
export function resolveVideo(videoId: string, page?: number): VideoHit | null {
  const idx = getVideoIndex();
  const key = videoId.trim().toLowerCase();

  const episodeHit = idx.byEpisodeVideo.get(key);
  if (episodeHit) return episodeHit;

  const courseHit = idx.byCourseVideo.get(key);
  if (!courseHit) return null;

  const course = getContent().coursesById.get(courseHit.courseId);
  const n = page && page > 0 ? page : 1;
  const ep = course?.episodes.find((e) => e.n === n);
  if (!ep) return null;
  return {
    courseId: courseHit.courseId,
    courseTitle: courseHit.courseTitle,
    episodeN: ep.n,
    episodeTitle: ep.title,
  };
}
