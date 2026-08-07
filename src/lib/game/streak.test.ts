import { strict as assert } from "node:assert";
import { test } from "node:test";
import { advanceStreak, emptyStreak } from "./streak";

test("首次学习从 1 起步", () => {
  const r = advanceStreak(emptyStreak(), "2026-08-07");
  assert.equal(r.current, 1);
  assert.equal(r.best, 1);
  assert.equal(r.lastDay, "2026-08-07");
  assert.ok(r.changed);
});

test("同一天重复学不重复计数", () => {
  const s = { current: 3, best: 5, lastDay: "2026-08-07", freezes: 0 };
  const r = advanceStreak(s, "2026-08-07");
  assert.equal(r.current, 3);
  assert.ok(!r.changed);
});

test("隔天连续 +1 并刷新 best", () => {
  const s = { current: 5, best: 5, lastDay: "2026-08-06", freezes: 0 };
  const r = advanceStreak(s, "2026-08-07");
  assert.equal(r.current, 6);
  assert.equal(r.best, 6);
});

test("断一天且有冻结:消耗一枚,连胜续命", () => {
  const s = { current: 9, best: 9, lastDay: "2026-08-05", freezes: 2 };
  const r = advanceStreak(s, "2026-08-07");
  assert.equal(r.current, 10);
  assert.equal(r.freezes, 1);
  assert.ok(r.usedFreeze);
});

test("断一天没冻结 / 断两天以上:归 1 重开", () => {
  const noFreeze = advanceStreak(
    { current: 9, best: 9, lastDay: "2026-08-05", freezes: 0 },
    "2026-08-07",
  );
  assert.equal(noFreeze.current, 1);
  assert.ok(!noFreeze.usedFreeze);
  const longGap = advanceStreak(
    { current: 9, best: 9, lastDay: "2026-08-01", freezes: 3 },
    "2026-08-07",
  );
  assert.equal(longGap.current, 1);
  assert.equal(longGap.freezes, 3, "断太久冻结救不了,也不该被扣");
});
