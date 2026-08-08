// CI / 本地：校验 content/ 全部内容（Zod + 引用完整性 + 仓库字幕）
import fs from "node:fs";
import path from "node:path";
import { loadContent, ContentError } from "../src/lib/content/load";

function validateRepoSubtitles(courseIds: Set<string>): number {
  const root = path.join(process.cwd(), "content", "subtitles");
  if (!fs.existsSync(root)) return 0;
  let count = 0;
  for (const courseId of fs.readdirSync(root)) {
    const dir = path.join(root, courseId);
    if (!fs.statSync(dir).isDirectory()) continue;
    if (!courseIds.has(courseId)) {
      throw new ContentError([`content/subtitles/${courseId}: 课程不存在`]);
    }
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      const p = `content/subtitles/${courseId}/${file}`;
      const n = Number(file.replace(/\.json$/, ""));
      if (!Number.isInteger(n) || n <= 0) {
        throw new ContentError([`${p}: 文件名必须是集号`]);
      }
      let raw: {
        lan?: string;
        lanDoc?: string;
        cues?: { from: number; to: number; text: string }[];
      };
      try {
        raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      } catch {
        throw new ContentError([`${p}: 不是合法 JSON`]);
      }
      if (
        !raw.lan ||
        !raw.lanDoc ||
        !Array.isArray(raw.cues) ||
        raw.cues.length === 0
      ) {
        throw new ContentError([`${p}: 缺 lan/lanDoc/cues`]);
      }
      let prev = -1;
      for (const c of raw.cues) {
        if (
          typeof c.from !== "number" ||
          typeof c.to !== "number" ||
          typeof c.text !== "string" ||
          c.to <= c.from ||
          c.from < prev
        ) {
          throw new ContentError([
            `${p}: cue 非法或时间轴非单调(from=${c.from})`,
          ]);
        }
        prev = c.from;
      }
      count++;
    }
  }
  return count;
}

try {
  const idx = loadContent();
  const subCount = validateRepoSubtitles(new Set(idx.courses.map((c) => c.id)));
  console.log(
    `内容校验通过：${idx.courses.length} 门课程，${idx.paths.length} 条路径，` +
      `${idx.roadmaps.length} 条成长路线，` +
      `${idx.analysisByCourse.size} 门课含 AI 分析，${subCount} 集仓库字幕`,
  );
} catch (err) {
  if (err instanceof ContentError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}
