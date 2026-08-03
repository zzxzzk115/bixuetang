import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  encounterForEpisode,
  lootForEpisode,
} from "./rpg";

describe("fixed RPG rewards", () => {
  it("uses a published encounter cadence", () => {
    assert.equal(encounterForEpisode(1, 24), "mob");
    assert.equal(encounterForEpisode(5, 24), "cache");
    assert.equal(encounterForEpisode(10, 24), "elite");
    assert.equal(encounterForEpisode(24, 24), "boss");
  });

  it("returns identical loot for every player", () => {
    const first = lootForEpisode("math", "advanced", 10, 24);
    const second = lootForEpisode("math", "advanced", 10, 24);
    assert.deepEqual(first, second);
    assert.equal(first.item.id, "math-elite");
    assert.equal(first.coins, 50);
  });

  it("ties every item to the learned subject", () => {
    assert.equal(lootForEpisode("cs", "basic", 1, 12).item.id, "cs-mob");
    assert.equal(lootForEpisode("physics", "basic", 5, 12).item.id, "physics-cache");
    assert.equal(lootForEpisode("ai", "basic", 12, 12).item.id, "ai-boss");
  });

  it("makes the final episode the boss before milestone rules", () => {
    assert.equal(encounterForEpisode(10, 10), "boss");
    assert.equal(lootForEpisode("cs", "intermediate", 10, 10).coins, 78);
  });
});
