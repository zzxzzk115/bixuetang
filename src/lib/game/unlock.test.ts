import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  completionOf,
  computeUnlocks,
  unlockedCourseIds,
  unlockEntry,
  UNLOCK_RATIO,
  type CourseUnlockInput,
} from "./unlock";

function course(
  id: string,
  prerequisites: string[] = [],
  watchedCount = 0,
  episodeCount = 10,
  done = false,
): CourseUnlockInput {
  return { id, prerequisites, episodeCount, watchedCount, done };
}

describe("completionOf", () => {
  it("done 的课直接算满，不看集数", () => {
    assert.equal(completionOf(course("a", [], 0, 10, true)), 1);
  });

  it("没有集数的课算 0，不产生 NaN 或 Infinity", () => {
    assert.equal(completionOf(course("a", [], 0, 0)), 0);
  });

  it("看的集数超出总集数时封顶到 1", () => {
    assert.equal(completionOf(course("a", [], 99, 10)), 1);
  });
});

describe("computeUnlocks", () => {
  it("没有前置的课永远开放", () => {
    const states = computeUnlocks([course("intro")]);
    assert.equal(states.get("intro")!.unlocked, true);
  });

  it("前置没学完就锁住，并列出缺哪几门", () => {
    const states = computeUnlocks([
      course("base", [], 2), // 20%
      course("next", ["base"]),
    ]);
    assert.equal(states.get("next")!.unlocked, false);
    assert.deepEqual(states.get("next")!.missing, ["base"]);
  });

  it("前置学到只差一集也还是锁着——门槛就是学完", () => {
    const states = computeUnlocks([
      course("base", [], 9, 10),
      course("next", ["base"]),
    ]);
    assert.equal(states.get("next")!.unlocked, false);
  });

  it("前置全部学完才放行", () => {
    const states = computeUnlocks([
      course("base", [], UNLOCK_RATIO * 10),
      course("next", ["base"]),
    ]);
    assert.equal(states.get("next")!.unlocked, true);
  });

  it("前置标记为 done 也算过关，不必逐集勾", () => {
    const states = computeUnlocks([
      course("base", [], 0, 10, true),
      course("next", ["base"]),
    ]);
    assert.equal(states.get("next")!.unlocked, true);
  });

  it("多个前置只差一门也算锁住", () => {
    const states = computeUnlocks([
      course("a", [], 10),
      course("b", [], 1),
      course("next", ["a", "b"]),
    ]);
    assert.deepEqual(states.get("next")!.missing, ["b"]);
  });

  it("已经看过一集的课保持开放——不能把学到一半的人锁在门外", () => {
    const states = computeUnlocks([
      course("base", [], 0),
      course("next", ["base"], 1),
    ]);
    assert.equal(states.get("next")!.unlocked, true);
  });

  it("前置指向不存在的课程时忽略，不会锁死整条线", () => {
    const states = computeUnlocks([course("next", ["nope"])]);
    assert.equal(states.get("next")!.unlocked, true);
  });

  it("链式前置逐级放开", () => {
    const chain = [
      course("l1", [], 10),
      course("l2", ["l1"], 0),
      course("l3", ["l2"], 0),
    ];
    const states = computeUnlocks(chain);
    assert.equal(states.get("l2")!.unlocked, true);
    // l2 还没开始学，l3 仍锁着
    assert.equal(states.get("l3")!.unlocked, false);
  });

  it("环形前置不会死循环，两边都锁着", () => {
    const states = computeUnlocks([
      course("a", ["b"]),
      course("b", ["a"]),
    ]);
    assert.equal(states.get("a")!.unlocked, false);
    assert.equal(states.get("b")!.unlocked, false);
  });
});

describe("unlockEntry", () => {
  it("前置链有两三层深时，一路找到最底下那门能学的", () => {
    const chain = [
      course("l1"), // 无前置，能学
      course("l2", ["l1"]),
      course("l3", ["l2"]),
      course("l4", ["l3"]),
    ];
    assert.equal(unlockEntry("l4", chain), "l1");
  });

  it("直接前置就能学时返回它自己", () => {
    const courses = [course("base", [], 10), course("next", ["base"])];
    // base 已过半 → next 本来就解锁了，这里测的是链条更长的情形
    const locked = [course("base"), course("next", ["base"])];
    assert.equal(unlockEntry("next", locked), "base");
    assert.equal(unlockEntry("next", courses), null); // 自己就是开的，无需入口
  });

  it("多个前置时挑更浅的那条", () => {
    const courses = [
      course("shallow"),
      course("deepBase"),
      course("deepMid", ["deepBase"]),
      course("target", ["deepMid", "shallow"]),
    ];
    assert.equal(unlockEntry("target", courses), "shallow");
  });

  it("环形前置不会死循环，返回 null", () => {
    assert.equal(
      unlockEntry("a", [course("a", ["b"]), course("b", ["a"])]),
      null,
    );
  });
});

describe("unlockedCourseIds", () => {
  it("只留下解锁的那些", () => {
    const ids = unlockedCourseIds([
      course("open"),
      course("locked", ["open"]),
      course("also-open", [], 3),
    ]);
    assert.deepEqual([...ids].sort(), ["also-open", "open"]);
  });
});
