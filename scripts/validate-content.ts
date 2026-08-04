// CI / 本地：校验 content/ 全部内容（Zod + 引用完整性）
import { loadContent, ContentError } from "../src/lib/content/load";

try {
  const idx = loadContent();
  console.log(
    `内容校验通过：${idx.courses.length} 门课程，${idx.paths.length} 条路径，` +
      `${idx.analysisByCourse.size} 门课含 AI 分析`,
  );
} catch (err) {
  if (err instanceof ContentError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}
