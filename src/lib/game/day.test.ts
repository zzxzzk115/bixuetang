import { strict as assert } from "node:assert";
import { test } from "node:test";
import { addDays, dayKey, diffDays } from "./day";

test("dayKey 按 UTC+8 日切:UTC 晚 16 点后算第二天", () => {
  // 2026-08-07 15:59 UTC = 北京 23:59,还是 7 号
  assert.equal(dayKey(Date.parse("2026-08-07T15:59:00Z")), "2026-08-07");
  // 2026-08-07 16:01 UTC = 北京 8 日 00:01
  assert.equal(dayKey(Date.parse("2026-08-07T16:01:00Z")), "2026-08-08");
});

test("diffDays 与 addDays 互逆,跨月正确", () => {
  assert.equal(diffDays("2026-08-07", "2026-08-08"), 1);
  assert.equal(diffDays("2026-08-08", "2026-08-07"), -1);
  assert.equal(diffDays("2026-07-31", "2026-08-01"), 1);
  assert.equal(addDays("2026-08-31", 1), "2026-09-01");
  assert.equal(addDays("2026-08-07", 21), "2026-08-28");
  assert.equal(diffDays("2026-08-07", addDays("2026-08-07", 365)), 365);
});
