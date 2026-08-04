import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateEquip, validateUnequip, type EquipState } from "./equip-rules";

const state = (): EquipState => ({
  equipped: new Map([[0, "sword"]]),
  owned: new Set(["sword", "shield"]),
});

describe("validateEquip", () => {
  it("正常装备通过", () => {
    assert.equal(validateEquip(state(), 1, "shield"), null);
  });
  it("同槽重装同一件也允许（幂等）", () => {
    assert.equal(validateEquip(state(), 0, "sword"), null);
  });
  it("槽位越界被拒", () => {
    assert.ok(validateEquip(state(), 3, "shield"));
    assert.ok(validateEquip(state(), -1, "shield"));
    assert.ok(validateEquip(state(), 1.5, "shield"));
  });
  it("未持有被拒", () => {
    assert.ok(validateEquip(state(), 1, "ghost-item"));
  });
  it("同一遗物占两个槽被拒", () => {
    assert.ok(validateEquip(state(), 1, "sword"));
  });
});

describe("validateUnequip", () => {
  it("卸下已装备的槽通过，空槽被拒", () => {
    assert.equal(validateUnequip(state(), 0), null);
    assert.ok(validateUnequip(state(), 1));
    assert.ok(validateUnequip(state(), 9));
  });
});
