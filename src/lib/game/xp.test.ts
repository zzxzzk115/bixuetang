import assert from "node:assert/strict";
import { test } from "node:test";
import { courseBonusXp, episodeRef, episodeXp } from "./xp";

test("episodeXp 按难度分档", () => {
  assert.equal(episodeXp("basic"), 10);
  assert.equal(episodeXp("intermediate"), 15);
  assert.equal(episodeXp("advanced"), 20);
});

test("courseBonusXp = 集数 × 5 × 难度系数（取整）", () => {
  assert.equal(courseBonusXp(20, "advanced"), 200);
  assert.equal(courseBonusXp(21, "intermediate"), Math.round(21 * 7.5));
  assert.equal(courseBonusXp(10, "basic"), 50);
});

test("episodeRef 幂等键格式稳定", () => {
  assert.equal(episodeRef("mit-6-824", 3), "mit-6-824:ep:3");
});
