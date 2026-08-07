import "server-only";

import { db } from "../db/client";
import { reviewCards } from "../db/schema";
import { addDays, dayKey } from "./day";
import { getQuizBank } from "./quiz-bank";

// 看完一集 → 该集的术语/知识点入复习队列(间隔重复的进料口)。
// 明天首次到期:当天刚看过还热乎,隔天开始考才符合间隔效应。

/** 每集入卡上限:复习量必须跟得上,一集塞几十张卡队列会雪崩 */
export const CARDS_PER_EPISODE = 8;

export function enqueueEpisodeCards(
  userId: number,
  courseId: string,
  episodeN: number,
): number {
  const entries = (getQuizBank().byCourse.get(courseId) ?? []).filter(
    (e) => e.epN === episodeN,
  );
  if (entries.length === 0) return 0;

  // 术语优先(卷宗词条是站内的「第一等公民」),再补知识点
  const picked = [
    ...entries.filter((e) => e.kind === "term"),
    ...entries.filter((e) => e.kind === "keypoint"),
  ].slice(0, CARDS_PER_EPISODE);

  const now = Date.now();
  const dueDay = addDays(dayKey(), 1);
  let created = 0;
  for (const e of picked) {
    const inserted = db
      .insert(reviewCards)
      .values({
        userId,
        courseId,
        episodeN,
        kind: e.kind,
        prompt: e.prompt,
        dueDay,
        intervalDays: 0,
        ease: 230,
        reps: 0,
        lapses: 0,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: reviewCards.id })
      .get();
    if (inserted) created++;
  }
  return created;
}
