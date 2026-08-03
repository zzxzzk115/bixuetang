import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { drawQuiz, type QuizEntry } from "./quiz-draw";

const entry = (i: number, over: Partial<QuizEntry> = {}): QuizEntry => ({
  courseId: "c1",
  subject: "cs",
  epN: i,
  kind: "term",
  prompt: `术语${i}`,
  answer: `这是第 ${i} 条术语的标准定义文本`,
  ...over,
});

const pool = Array.from({ length: 12 }, (_, i) => entry(i + 1));

describe("drawQuiz", () => {
  it("同一 seed 完全可复现", () => {
    const a = drawQuiz({ pool, count: 5, seed: 42 });
    const b = drawQuiz({ pool, count: 5, seed: 42 });
    assert.deepEqual(a, b);
    const c = drawQuiz({ pool, count: 5, seed: 43 });
    assert.notDeepEqual(
      a.map((q) => q.prompt),
      c.map((q) => q.prompt),
    );
  });

  it("四个选项互异、正确答案在 answerIndex 位置", () => {
    for (const q of drawQuiz({ pool, count: 8, seed: 7 })) {
      assert.equal(q.options.length, 4);
      assert.equal(new Set(q.options).size, 4);
      const original = pool.find((e) => e.prompt === q.prompt)!;
      assert.equal(q.options[q.answerIndex], original.answer);
    }
  });

  it("pool 太小时从 fallback 补干扰项", () => {
    const tiny = [entry(1)];
    const fallback = Array.from({ length: 8 }, (_, i) => entry(i + 10));
    const qs = drawQuiz({ pool: tiny, fallback, count: 1, seed: 1 });
    assert.equal(qs.length, 1);
    assert.equal(new Set(qs[0].options).size, 4);
  });

  it("凑不出 3 个干扰项就跳过该题", () => {
    const qs = drawQuiz({ pool: [entry(1), entry(2)], count: 2, seed: 1 });
    assert.equal(qs.length, 0);
  });

  it("count 超出可出题数时给全部能出的", () => {
    const qs = drawQuiz({ pool, count: 99, seed: 5 });
    assert.equal(qs.length, pool.length);
  });
});
