import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyElo,
  duelResult,
  expectedScore,
  rankFromRating,
  type PkOutcome,
} from "./elo";

const o = (c: 0 | 1, t: number): PkOutcome => ({ c, t });

describe("elo", () => {
  it("同分对手期望 0.5，胜 +16", () => {
    assert.equal(expectedScore(1000, 1000), 0.5);
    assert.equal(applyElo(1000, 1000, 1), 1016);
    assert.equal(applyElo(1000, 1000, 0), 984);
  });
  it("以弱胜强得分多，以强胜弱得分少", () => {
    const upset = applyElo(1000, 1200, 1) - 1000;
    const expected = applyElo(1200, 1000, 1) - 1200;
    assert.ok(upset > expected);
  });
  it("平局：高分方掉分", () => {
    assert.ok(applyElo(1200, 1000, 0.5) < 1200);
    assert.ok(applyElo(1000, 1200, 0.5) > 1000);
  });
});

describe("rankFromRating", () => {
  it("段位边界", () => {
    assert.equal(rankFromRating(0).key, "bronze");
    assert.equal(rankFromRating(999).key, "bronze");
    assert.equal(rankFromRating(1000).key, "silver");
    assert.equal(rankFromRating(1100).key, "gold");
    assert.equal(rankFromRating(2000).key, "king");
  });
});

describe("duelResult", () => {
  it("答对多者胜", () => {
    assert.equal(duelResult([o(1, 9000), o(1, 9000)], [o(1, 100), o(0, 100)]), 1);
  });
  it("同分比总用时，用时少者胜", () => {
    assert.equal(duelResult([o(1, 3000)], [o(1, 5000)]), 1);
    assert.equal(duelResult([o(1, 5000)], [o(1, 3000)]), 0);
  });
  it("完全同分同时为平局", () => {
    assert.equal(duelResult([o(1, 3000)], [o(1, 3000)]), 0.5);
  });
});
