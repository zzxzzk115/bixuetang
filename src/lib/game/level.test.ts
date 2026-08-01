import assert from "node:assert/strict";
import { test } from "node:test";
import {
  levelFromXp,
  levelProgress,
  skillPointsEarned,
  totalXpForLevel,
} from "./level";

test("totalXpForLevel：1 级 0 XP，2 级 100，3 级 300", () => {
  assert.equal(totalXpForLevel(1), 0);
  assert.equal(totalXpForLevel(2), 100);
  assert.equal(totalXpForLevel(3), 300);
  assert.equal(totalXpForLevel(10), 50 * 9 * 10);
});

test("levelFromXp 与 totalXpForLevel 互逆", () => {
  assert.equal(levelFromXp(0), 1);
  assert.equal(levelFromXp(99), 1);
  assert.equal(levelFromXp(100), 2);
  assert.equal(levelFromXp(299), 2);
  assert.equal(levelFromXp(300), 3);
  for (let l = 1; l <= 60; l++) {
    assert.equal(levelFromXp(totalXpForLevel(l)), l, `边界 level=${l}`);
    assert.equal(levelFromXp(totalXpForLevel(l + 1) - 1), l, `上界内 level=${l}`);
  }
});

test("levelFromXp 对负数与小数稳健", () => {
  assert.equal(levelFromXp(-5), 1);
  assert.equal(levelFromXp(100.5), 2);
});

test("levelProgress 分段正确", () => {
  const p = levelProgress(150); // 2 级（100~300），段内 50/200
  assert.equal(p.level, 2);
  assert.equal(p.current, 50);
  assert.equal(p.span, 200);
  assert.equal(p.ratio, 0.25);
});

test("每升 1 级得 1 技能点", () => {
  assert.equal(skillPointsEarned(1), 0);
  assert.equal(skillPointsEarned(5), 4);
});
