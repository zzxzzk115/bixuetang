import assert from "node:assert/strict";
import { test } from "node:test";
import type { SkillNode } from "../content/schema";
import { computeSkillViews, spentPoints, subjectStats } from "./skills";

const node = (over: Partial<SkillNode> & { id: string }): SkillNode => ({
  title: over.id,
  subject: "cs",
  tier: 1,
  cost: 1,
  requires: [],
  courses: ["c1"],
  rule: "any",
  ...over,
});

const tree: SkillNode[] = [
  node({ id: "a", courses: ["c1", "c2"], rule: "any" }),
  node({ id: "b", requires: ["a"], courses: ["c3", "c4"], rule: "all", tier: 2 }),
  node({ id: "m", subject: "math", courses: ["c5"], tier: 3 }),
];

test("rule=any：完成任一课程即满足", () => {
  const views = computeSkillViews(tree, new Set(["c2"]), new Set());
  assert.equal(views.find((v) => v.node.id === "a")!.state, "available");
});

test("rule=all：需全部完成；前置未点亮时保持锁定", () => {
  const done = new Set(["c3", "c4"]);
  let views = computeSkillViews(tree, done, new Set());
  const b = () => views.find((v) => v.node.id === "b")!;
  assert.equal(b().coursesMet, true);
  assert.equal(b().state, "locked"); // 前置 a 未点亮
  views = computeSkillViews(tree, done, new Set(["a"]));
  assert.equal(b().state, "available");
});

test("已点亮节点状态为 lit，花费按 cost 求和", () => {
  const lit = new Set(["a", "b"]);
  const views = computeSkillViews(tree, new Set(), lit);
  assert.equal(views.find((v) => v.node.id === "a")!.state, "lit");
  assert.equal(spentPoints(tree, lit), 2);
});

test("subjectStats 按学科累加 tier", () => {
  const stats = subjectStats(tree, new Set(["a", "b", "m"]));
  assert.equal(stats.cs, 3); // 1 + 2
  assert.equal(stats.math, 3);
  assert.equal(stats.physics, 0);
});
