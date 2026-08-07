import assert from "node:assert/strict";
import test from "node:test";
import { MAX_HEARTS, sessionPerks } from "./session-perks";

const base = { insight: 0, focus: 0, precision: 0, resolve: 0 };

test("基础生命 3 心", () => {
  assert.equal(sessionPerks(base).hearts, 3);
});

test("意志加生命(每 15 点 +1)", () => {
  assert.equal(sessionPerks({ ...base, resolve: 30 }).hearts, 5);
});

test("等级加生命上限(每 5 级 +1)", () => {
  assert.equal(sessionPerks(base, { level: 10 }).hearts, 5);
  assert.equal(sessionPerks({ ...base, resolve: 45 }, { level: 20 }).hearts, MAX_HEARTS);
});

test("生命封顶 8", () => {
  assert.equal(
    sessionPerks({ ...base, resolve: 200 }, { level: 200 }).hearts,
    MAX_HEARTS,
  );
});

test("护盾血透传且非负", () => {
  assert.equal(sessionPerks(base, { shieldHearts: 2 }).shieldHearts, 2);
  assert.equal(sessionPerks(base, { shieldHearts: -5 }).shieldHearts, 0);
  assert.equal(sessionPerks(base).shieldHearts, 0);
});
