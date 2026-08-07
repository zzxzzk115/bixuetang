import assert from "node:assert/strict";
import test from "node:test";
import { curseStat, relicBonus, SUBJECT_STAT } from "./relics";

test("普通遗物只加主属性", () => {
  const b = relicBonus({ subject: "cs", rarity: "rare" }, 1);
  assert.equal(b.precision, 4); // cs → precision, rare → 4
  assert.equal(b.resolve, 0);
});

test("诅咒遗物主属性翻倍 + 惩罚属性负增益", () => {
  const b = relicBonus({ subject: "cs", rarity: "rare", cursed: true }, 1);
  // cs 主属性 precision:4×2=8;惩罚落在意志 -4
  assert.equal(b.precision, 8);
  assert.equal(b[curseStat("cs")], -4);
  assert.equal(curseStat("cs"), "resolve");
});

test("主属性本就是意志时,诅咒惩罚改扣专注", () => {
  // physics → resolve,curse 落到 focus
  assert.equal(SUBJECT_STAT.physics, "resolve");
  assert.equal(curseStat("physics"), "focus");
  const b = relicBonus({ subject: "physics", rarity: "common", cursed: true }, 1);
  assert.equal(b.resolve, 2); // common 1 ×2
  assert.equal(b.focus, -1);
});
