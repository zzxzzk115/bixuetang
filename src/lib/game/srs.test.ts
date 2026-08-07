import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  EASE_MAX,
  EASE_MIN,
  EASE_START,
  INTERVALS,
  newCard,
  schedule,
} from "./srs";

const D = "2026-08-07";

test("连续答对走 1/3/7/21 固定阶梯", () => {
  let card = newCard();
  const seen: number[] = [];
  for (let i = 0; i < 4; i++) {
    const r = schedule(card, { correct: true }, D);
    seen.push(r.intervalDays);
    card = r;
  }
  assert.deepEqual(seen, [...INTERVALS]);
  assert.equal(schedule(newCard(), { correct: true }, D).dueDay, "2026-08-08");
});

test("阶梯之后进入 ease 乘法且单调变长", () => {
  let card = newCard();
  for (let i = 0; i < 4; i++) card = schedule(card, { correct: true }, D);
  const fifth = schedule(card, { correct: true }, D);
  // 21 天 × ~2.5 ≈ 50+ 天
  assert.ok(fifth.intervalDays > 21, `期望 >21,得到 ${fifth.intervalDays}`);
  const sixth = schedule(fifth, { correct: true }, D);
  assert.ok(sixth.intervalDays > fifth.intervalDays);
});

test("答错重置:间隔回 1 天、reps 清零、lapses +1、ease 下降但有下限", () => {
  let card = newCard();
  for (let i = 0; i < 3; i++) card = schedule(card, { correct: true }, D);
  const failed = schedule(card, { correct: false }, D);
  assert.equal(failed.intervalDays, 1);
  assert.equal(failed.reps, 0);
  assert.equal(failed.lapses, 1);
  assert.ok(failed.ease < card.ease);
  // 连续答错 ease 不击穿下限
  let worst = failed;
  for (let i = 0; i < 20; i++) worst = schedule(worst, { correct: false }, D);
  assert.equal(worst.ease, EASE_MIN);
});

test("快答加成 ease,且 ease 有上限", () => {
  const slow = schedule(newCard(), { correct: true }, D);
  const fast = schedule(newCard(), { correct: true, fast: true }, D);
  assert.ok(fast.ease > slow.ease);
  assert.equal(slow.ease, EASE_START + 5);
  let card = newCard();
  for (let i = 0; i < 30; i++) card = schedule(card, { correct: true, fast: true }, D);
  assert.equal(card.ease, EASE_MAX);
});
