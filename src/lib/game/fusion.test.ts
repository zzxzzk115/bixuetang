import assert from "node:assert/strict";
import test from "node:test";
import {
  fusableError,
  fusionResult,
  NEXT_RARITY,
  UPGRADE_CHANCE,
} from "./fusion";
import { itemForEncounter } from "./rpg";

const csCommon = itemForEncounter("cs", "mob");
const mathCommon = itemForEncounter("math", "mob");
const csLegendary = itemForEncounter("cs", "boss");

test("必须恰好三件且同稀有度", () => {
  assert.ok(fusableError([csCommon, csCommon]));
  assert.ok(fusableError([csCommon, csCommon, csLegendary]));
  assert.equal(fusableError([csCommon, csCommon, mathCommon]), null);
});

test("掷点低于概率则升一级稀有度", () => {
  const out = fusionResult([csCommon, csCommon, csCommon], 0.01, 0);
  assert.equal(out.upgraded, true);
  assert.equal(out.item.rarity, NEXT_RARITY.common);
});

test("掷点高于概率则保持原稀有度", () => {
  const out = fusionResult(
    [csCommon, csCommon, csCommon],
    UPGRADE_CHANCE.common + 0.01,
    0,
  );
  assert.equal(out.upgraded, false);
  assert.equal(out.item.rarity, "common");
});

test("传说融合不再升级,只重掷学科", () => {
  const out = fusionResult([csLegendary, csLegendary, csLegendary], 0, 0.99);
  assert.equal(out.upgraded, false);
  assert.equal(out.item.rarity, "legendary");
});

test("产物学科从输入继承(第二掷选下标)", () => {
  const inputs = [csCommon, mathCommon, csCommon];
  assert.equal(fusionResult(inputs, 1, 0.34).item.subject, "math");
  assert.equal(fusionResult(inputs, 1, 0).item.subject, "cs");
});
