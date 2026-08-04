import assert from "node:assert/strict";
import { test } from "node:test";
import {
  boostedXp,
  courseBonusXp,
  durationBonus,
  episodeRef,
  episodeXp,
} from "./xp";

test("episodeXp = 难度底分 + 时长加成，且永远是 10 的倍数", () => {
  // 无时长数据时按默认 15 分钟算（无时长加成）
  assert.equal(episodeXp("basic"), 10);
  assert.equal(episodeXp("intermediate"), 20);
  assert.equal(episodeXp("advanced"), 30);

  // 短视频不给时长加成，长视频阶梯加成
  assert.equal(episodeXp("basic", 5 * 60), 10);
  assert.equal(episodeXp("basic", 20 * 60), 20);
  assert.equal(episodeXp("basic", 45 * 60), 30);
  assert.equal(episodeXp("basic", 65 * 60), 40);
  // 封顶 +30：两小时的课也不会失控
  assert.equal(episodeXp("basic", 120 * 60), 40);
  assert.equal(episodeXp("advanced", 180 * 60), 60);

  for (const level of ["basic", "intermediate", "advanced"] as const) {
    for (const min of [1, 7, 19, 20, 33, 60, 90, 200]) {
      assert.equal(episodeXp(level, min * 60) % 10, 0);
    }
  }
});

test("durationBonus 每满 20 分钟 +10，封顶 30", () => {
  assert.equal(durationBonus(0 * 60), 0);
  assert.equal(durationBonus(19 * 60), 0);
  assert.equal(durationBonus(20 * 60), 10);
  assert.equal(durationBonus(59 * 60), 20);
  assert.equal(durationBonus(60 * 60), 30);
  assert.equal(durationBonus(600 * 60), 30);
});

test("boostedXp 药水加成后仍是 10 的倍数", () => {
  assert.equal(boostedXp(10, 150), 20); // 15 → 20
  assert.equal(boostedXp(20, 150), 30);
  assert.equal(boostedXp(30, 150), 50); // 45 → 50
  assert.equal(boostedXp(20, 300), 60);
  assert.equal(boostedXp(10, 100), 10);
  for (const base of [10, 20, 30, 40, 50, 60]) {
    for (const pct of [100, 150, 300]) {
      assert.equal(boostedXp(base, pct) % 10, 0);
    }
  }
});

test("courseBonusXp = 集数 × 5 × 难度系数，取整到 10", () => {
  assert.equal(courseBonusXp(20, "advanced"), 200);
  assert.equal(courseBonusXp(10, "basic"), 50);
  assert.equal(courseBonusXp(21, "intermediate"), 160); // 157.5 → 160
  assert.equal(courseBonusXp(7, "basic") % 10, 0);
});

test("episodeRef 幂等键格式稳定", () => {
  assert.equal(episodeRef("mit-6-824", 3), "mit-6-824:ep:3");
});
