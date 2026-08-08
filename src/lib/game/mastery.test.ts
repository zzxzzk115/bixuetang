import { test } from "node:test";
import assert from "node:assert/strict";
import { masteryPct } from "./mastery";

test("masteryPct 无卡返回 null", () => {
  assert.equal(masteryPct([]), null);
});

test("masteryPct 全未掌握 → 0", () => {
  assert.equal(masteryPct([{ intervalDays: 1 }, { intervalDays: 3 }]), 0);
});

test("masteryPct 部分掌握(interval≥7 算掌握)", () => {
  // 4 张里 1 张达到 7 天 → 25%
  assert.equal(
    masteryPct([
      { intervalDays: 1 },
      { intervalDays: 3 },
      { intervalDays: 7 },
      { intervalDays: 3 },
    ]),
    25,
  );
});

test("masteryPct 全掌握 → 100", () => {
  assert.equal(masteryPct([{ intervalDays: 21 }, { intervalDays: 7 }]), 100);
});
