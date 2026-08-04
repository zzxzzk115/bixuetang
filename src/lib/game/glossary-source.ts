import "server-only";

import { getContent } from "../content/load";
import type { TermInput } from "./glossary-unlock";

// 把全站 AI 分析里的术语摊平成「一集一个词」的条目。
// 解锁逻辑本身是纯函数（glossary-unlock.ts，可单测），数据来源留在这里，
// 免得那个模块被迫依赖文件系统。

/** 进程内缓存：内容是构建期固定的，没必要每次请求重新摊平 */
const cache = globalThis as unknown as { __termInputs?: TermInput[] };

export function allTermInputs(): TermInput[] {
  if (cache.__termInputs) return cache.__termInputs;

  const content = getContent();
  const out: TermInput[] = [];
  for (const [courseId, analysis] of content.analysisByCourse) {
    const courseTitle = content.coursesById.get(courseId)?.title ?? courseId;
    for (const episode of analysis.episodes) {
      for (const term of episode.terms) {
        out.push({
          courseId,
          courseTitle,
          episodeN: episode.n,
          term: term.term,
          definition: term.definition,
        });
      }
    }
  }
  cache.__termInputs = out;
  return out;
}
