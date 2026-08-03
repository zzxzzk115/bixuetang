import type { Subject } from "../content/schema";

// 出题器：从题库条目抽四选一题。纯函数 + 种子随机（mulberry32），
// 同一 seed 出题完全可复现——服务端出题、留档 seed 即可审计。

export interface QuizEntry {
  courseId: string;
  subject: Subject;
  /** 出处集号 */
  epN: number;
  kind: "term" | "keypoint";
  /** 题面（术语名 / 知识点标题） */
  prompt: string;
  /** 正确答案（定义 / 详解） */
  answer: string;
}

export interface QuizQuestion {
  kind: "term" | "keypoint";
  prompt: string;
  options: string[];
  answerIndex: number;
  courseId: string;
  epN: number;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 抽 count 道四选一。干扰项优先取同 kind 且长度相近（±60%）的答案——
 * 防「最长的就是正确答案」；pool 里凑不齐再去 fallback（同学科/全库）找。
 */
export function drawQuiz({
  pool,
  fallback = [],
  count,
  seed,
}: {
  pool: QuizEntry[];
  fallback?: QuizEntry[];
  count: number;
  seed: number;
}): QuizQuestion[] {
  const rand = mulberry32(seed);
  const questions: QuizQuestion[] = [];

  for (const entry of shuffle(pool, rand)) {
    if (questions.length >= count) break;
    const distractors = pickDistractors(entry, pool, fallback, rand);
    if (distractors.length < 3) continue;
    const options = shuffle([entry.answer, ...distractors], rand);
    questions.push({
      kind: entry.kind,
      prompt: entry.prompt,
      options,
      answerIndex: options.indexOf(entry.answer),
      courseId: entry.courseId,
      epN: entry.epN,
    });
  }
  return questions;
}

function pickDistractors(
  entry: QuizEntry,
  pool: QuizEntry[],
  fallback: QuizEntry[],
  rand: () => number,
): string[] {
  const chosen: string[] = [];
  const used = new Set([entry.answer]);
  const lenOk = (s: string) =>
    s.length >= entry.answer.length * 0.4 && s.length <= entry.answer.length * 1.6;

  // 三轮放宽：同 kind+长度相近 → 同 kind → 任意
  const rounds: ((e: QuizEntry) => boolean)[] = [
    (e) => e.kind === entry.kind && lenOk(e.answer),
    (e) => e.kind === entry.kind,
    () => true,
  ];
  for (const okFn of rounds) {
    for (const source of [pool, fallback]) {
      if (chosen.length >= 3) return chosen;
      for (const e of shuffle(source, rand)) {
        if (chosen.length >= 3) break;
        if (e.prompt === entry.prompt || used.has(e.answer) || !okFn(e)) continue;
        used.add(e.answer);
        chosen.push(e.answer);
      }
    }
  }
  return chosen;
}
