import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { mistakes } from "../db/schema";
import { getContent } from "../content/load";
import { getQuizBank } from "./quiz-bank";
import { drawQuiz, type QuizEntry, type QuizQuestion } from "./quiz-draw";

// 错题本读侧 + 重刷出题。写侧(record/resolve)在 mistakes-actions.ts。

export interface MistakeItem {
  courseId: string;
  epN: number;
  kind: "term" | "keypoint";
  prompt: string;
  answer: string;
}

/** 落一批错题(幂等去重:同题只累计次数)。供 action 调用。 */
export function saveMistakes(userId: number, items: MistakeItem[]): number {
  const byId = getContent().coursesById;
  const now = Date.now();
  let saved = 0;
  for (const m of items.slice(0, 50)) {
    if (!byId.has(m.courseId)) continue;
    const prompt = String(m.prompt).slice(0, 200);
    const answer = String(m.answer).slice(0, 300);
    if (!prompt || !answer) continue;
    db.insert(mistakes)
      .values({
        userId,
        courseId: m.courseId,
        epN: Number(m.epN) || 0,
        kind: m.kind === "keypoint" ? "keypoint" : "term",
        prompt,
        answer,
        timesWrong: 1,
        addedAt: now,
        lastWrongAt: now,
      })
      .onConflictDoUpdate({
        target: [mistakes.userId, mistakes.courseId, mistakes.prompt],
        set: {
          timesWrong: sql`${mistakes.timesWrong} + 1`,
          lastWrongAt: now,
        },
      })
      .run();
    saved++;
  }
  return saved;
}

export function getMistakeCount(userId: number): number {
  return (
    db
      .select({ n: sql<number>`count(*)` })
      .from(mistakes)
      .where(eq(mistakes.userId, userId))
      .get()?.n ?? 0
  );
}

export interface MistakeRow {
  id: number;
  courseId: string;
  courseTitle: string;
  epN: number;
  prompt: string;
  answer: string;
  timesWrong: number;
}

/** 错题清单(按最近答错倒序),课程页/错题本列表用 */
export function listMistakes(userId: number, limit = 100): MistakeRow[] {
  const byId = getContent().coursesById;
  return db
    .select()
    .from(mistakes)
    .where(eq(mistakes.userId, userId))
    .orderBy(desc(mistakes.lastWrongAt))
    .limit(limit)
    .all()
    .map((m) => ({
      id: m.id,
      courseId: m.courseId,
      courseTitle: byId.get(m.courseId)?.title ?? m.courseId,
      epN: m.epN,
      prompt: m.prompt,
      answer: m.answer,
      timesWrong: m.timesWrong,
    }));
}

export interface DrillCard {
  mistakeId: number;
  question: QuizQuestion;
}

/** 生成一套重刷考卷 + 其 seed(seed 在 lib 里内联时间,避开组件 render 里调 Date.now)。 */
export function drawMistakeDrill(
  userId: number,
  limit = 20,
  now = Date.now(),
): { seed: number; cards: DrillCard[] } {
  const seed = (now ^ (userId << 16)) >>> 0;
  return { seed, cards: buildMistakeDrill(userId, seed, limit) };
}

/** 重刷出题:给每道错题按题库现抽一套四选一(正解 = 错题记录的答案)。 */
export function buildMistakeDrill(
  userId: number,
  seed: number,
  limit = 10,
): DrillCard[] {
  const rows = db
    .select()
    .from(mistakes)
    .where(eq(mistakes.userId, userId))
    .orderBy(desc(mistakes.lastWrongAt))
    .limit(limit)
    .all();
  const bank = getQuizBank();
  const byId = getContent().coursesById;
  const cards: DrillCard[] = [];
  for (const m of rows) {
    const course = byId.get(m.courseId);
    if (!course) continue;
    const entry: QuizEntry = {
      courseId: m.courseId,
      subject: course.subject,
      epN: m.epN,
      kind: m.kind === "keypoint" ? "keypoint" : "term",
      prompt: m.prompt,
      answer: m.answer,
    };
    const fallback =
      bank.byCourse.get(m.courseId) ??
      bank.bySubject.get(course.subject) ??
      bank.all;
    const [question] = drawQuiz({
      pool: [entry],
      fallback,
      count: 1,
      seed: (seed ^ (m.id << 8)) >>> 0,
    });
    // 干扰项凑不齐(题库太薄)就跳过这道,不给残缺题
    if (question) cards.push({ mistakeId: m.id, question });
  }
  return cards;
}

/** 校验某道错题在这次重刷里是否真答对了(交卷去重防误清)。 */
export function isMistakeAnswerCorrect(
  userId: number,
  mistakeId: number,
  seed: number,
  chosen: number,
): boolean {
  const m = db
    .select()
    .from(mistakes)
    .where(and(eq(mistakes.id, mistakeId), eq(mistakes.userId, userId)))
    .get();
  if (!m) return false;
  const course = getContent().coursesById.get(m.courseId);
  if (!course) return false;
  const bank = getQuizBank();
  const entry: QuizEntry = {
    courseId: m.courseId,
    subject: course.subject,
    epN: m.epN,
    kind: m.kind === "keypoint" ? "keypoint" : "term",
    prompt: m.prompt,
    answer: m.answer,
  };
  const fallback =
    bank.byCourse.get(m.courseId) ??
    bank.bySubject.get(course.subject) ??
    bank.all;
  const [question] = drawQuiz({
    pool: [entry],
    fallback,
    count: 1,
    seed: (seed ^ (m.id << 8)) >>> 0,
  });
  return !!question && chosen === question.answerIndex;
}
