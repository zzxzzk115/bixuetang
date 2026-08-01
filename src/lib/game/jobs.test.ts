import assert from "node:assert/strict";
import { test } from "node:test";
import type { Job } from "../content/schema";
import { canPromote } from "./jobs";

const job = (over: Partial<Job> & { id: string }): Job => ({
  title: over.id,
  tier: 1,
  parents: [],
  requires: {},
  ...over,
});

test("无条件职业（新手）任何人都可转", () => {
  const verdict = canPromote(job({ id: "novice", tier: 0 }), {
    level: 1,
    litSkills: new Set(),
    heldJobs: new Set(),
  });
  assert.equal(verdict.ok, true);
});

test("minLevel 与 allOf 同时约束", () => {
  const j = job({
    id: "cs-apprentice",
    parents: ["novice"],
    requires: { minLevel: 3, skills: { allOf: ["prog"], anyOf: [], minAnyOf: 1 } },
  });
  const base = { litSkills: new Set(["prog"]), heldJobs: new Set(["novice"]) };
  assert.equal(canPromote(j, { level: 2, ...base }).ok, false);
  assert.equal(canPromote(j, { level: 2, ...base }).missingLevel, 1);
  assert.equal(canPromote(j, { level: 3, ...base }).ok, true);
  assert.equal(
    canPromote(j, { level: 3, litSkills: new Set(), heldJobs: base.heldJobs }).ok,
    false,
  );
});

test("多 parent 兼修职业：需同时持有全部 parents", () => {
  const j = job({ id: "arcane", tier: 2, parents: ["cs-app", "math-app"] });
  assert.equal(
    canPromote(j, {
      level: 20,
      litSkills: new Set(),
      heldJobs: new Set(["cs-app"]),
    }).ok,
    false,
  );
  assert.deepEqual(
    canPromote(j, {
      level: 20,
      litSkills: new Set(),
      heldJobs: new Set(["cs-app"]),
    }).missingParents,
    ["math-app"],
  );
  assert.equal(
    canPromote(j, {
      level: 20,
      litSkills: new Set(),
      heldJobs: new Set(["cs-app", "math-app"]),
    }).ok,
    true,
  );
});

test("anyOf + minAnyOf：至少点亮 N 个", () => {
  const j = job({
    id: "warden",
    requires: { skills: { allOf: [], anyOf: ["os", "dist", "net"], minAnyOf: 2 } },
  });
  const held = new Set<string>();
  assert.equal(
    canPromote(j, { level: 1, litSkills: new Set(["os"]), heldJobs: held }).ok,
    false,
  );
  assert.equal(
    canPromote(j, { level: 1, litSkills: new Set(["os", "net"]), heldJobs: held })
      .ok,
    true,
  );
});
