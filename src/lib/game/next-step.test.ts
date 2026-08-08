import { test } from "node:test";
import assert from "node:assert/strict";
import { pickNextStep } from "./next-step";
import type { GameBootstrap } from "./bootstrap-types";

// 只造 pickNextStep 用到的字段,其余按最小骨架 cast
type C = GameBootstrap["courses"][number];
function course(p: Partial<C> & { id: string }): C {
  return {
    id: p.id,
    title: p.title ?? p.id,
    subject: p.subject ?? "cs",
    level: p.level ?? "basic",
    episodeCount: p.episodeCount ?? 5,
    watchedCount: p.watchedCount ?? 0,
    status: p.status ?? null,
    episodeNs: [],
    watched: [],
    hasQuiz: false,
    prerequisites: [],
    unlocked: p.unlocked ?? true,
    missingPrereqs: [],
    unlockEntry: null,
  } as C;
}
function boot(over: Partial<GameBootstrap>): GameBootstrap {
  return {
    courses: [],
    paths: [],
    routeId: null,
    lastWatched: null,
    ...over,
  } as unknown as GameBootstrap;
}

test("continue 取 lastWatched(未看完),next 取首门可学未学", () => {
  const r = pickNextStep(
    boot({
      courses: [
        course({ id: "a", watchedCount: 2, episodeCount: 5 }),
        course({ id: "b", watchedCount: 0, unlocked: true }),
        course({ id: "c", watchedCount: 0, unlocked: false }), // 锁着不推
      ],
      lastWatched: { courseId: "a", episodeN: 3, ratioPct: 40 } as never,
    }),
  );
  assert.equal(r.continue?.courseId, "a");
  assert.equal(r.next?.courseId, "b"); // c 锁着,选 b
});

test("上次那门已学完 → 不 continue,让位下一步", () => {
  const r = pickNextStep(
    boot({
      courses: [
        course({ id: "a", watchedCount: 5, episodeCount: 5 }),
        course({ id: "b", watchedCount: 0 }),
      ],
      lastWatched: { courseId: "a", episodeN: 5, ratioPct: 100 } as never,
    }),
  );
  assert.equal(r.continue, null);
  assert.equal(r.next?.courseId, "b");
});

test("next 优先当前路线的课程顺序", () => {
  const r = pickNextStep(
    boot({
      courses: [
        course({ id: "x" }),
        course({ id: "y" }),
      ],
      paths: [
        { id: "p1", mode: "course", courseIds: ["y", "x"] } as never,
      ],
      routeId: "p1",
    }),
  );
  assert.equal(r.next?.courseId, "y"); // 路线里 y 在前
});

test("无 lastWatched、无路线 → 兜底全库首门可学未学", () => {
  const r = pickNextStep(
    boot({ courses: [course({ id: "only" })] }),
  );
  assert.equal(r.continue, null);
  assert.equal(r.next?.courseId, "only");
});
