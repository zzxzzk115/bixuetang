// CI / 本地：校验 content/ 全部内容（Zod + 引用完整性 + DAG 环检测）
import { loadContent, ContentError } from "../src/lib/content/load";

try {
  const idx = loadContent();
  console.log(
    `内容校验通过：${idx.courses.length} 门课程，${idx.paths.length} 条路径，` +
      `${idx.skillNodes.length} 个技能节点，${idx.jobs.length} 个职业`,
  );
} catch (err) {
  if (err instanceof ContentError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}
