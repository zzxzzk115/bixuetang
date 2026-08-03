import assert from "node:assert/strict";
import test from "node:test";
import {
  FOCUS_REWARD_MINUTES,
  isSummaryEvidence,
  normalizeFocusMinutes,
  questIsComplete,
} from "./quest-rules";

test("focus minutes are rounded and bounded", () => {
  assert.equal(normalizeFocusMinutes(9.6), 10);
  assert.equal(normalizeFocusMinutes(-4), 0);
  assert.equal(normalizeFocusMinutes(999), 120);
  assert.equal(normalizeFocusMinutes(Number.NaN), 0);
});

test("battle recall requires meaningful evidence", () => {
  assert.equal(isSummaryEvidence("太短"), false);
  assert.equal(isSummaryEvidence("我能用自己的话复述这一集的核心内容"), true);
});

test("daily quest completion follows its evidence type", () => {
  const evidence = {
    watched: true,
    focusMinutes: FOCUS_REWARD_MINUTES + 5,
    checkpointPassed: false,
  };
  assert.equal(questIsComplete("encounter", evidence, 1), true);
  assert.equal(questIsComplete("focus", evidence, 15), true);
  assert.equal(questIsComplete("checkpoint", evidence, 1), false);
});
