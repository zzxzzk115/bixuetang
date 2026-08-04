import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLessonTrack,
  findTrackNode,
  videoNodeCount,
} from "./lesson-track";

const seq = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("videoNodeCount", () => {
  it("每节点最多 4 集、节点数不设上限", () => {
    assert.equal(videoNodeCount(1), 1);
    assert.equal(videoNodeCount(3), 1);
    assert.equal(videoNodeCount(4), 1);
    assert.equal(videoNodeCount(5), 2);
    assert.equal(videoNodeCount(8), 2);
    assert.equal(videoNodeCount(15), 4);
    assert.equal(videoNodeCount(20), 5);
    assert.equal(videoNodeCount(120), 30);
    assert.equal(videoNodeCount(142), 36);
    assert.equal(videoNodeCount(0), 0);
  });
  it("任何节点都不超过 4 集", () => {
    for (const n of [1, 5, 7, 15, 22, 97, 142]) {
      const track = buildLessonTrack(seq(n), true);
      for (const node of track) {
        if (node.kind === "video") assert.ok(node.eps.length <= 4);
      }
    }
  });
});

describe("buildLessonTrack", () => {
  it("集数全覆盖且不重复，视频节点大小均匀", () => {
    const track = buildLessonTrack(seq(22), true);
    const videos = track.filter((n) => n.kind === "video");
    const all = videos.flatMap((n) => n.eps);
    assert.deepEqual(all, seq(22));
    const sizes = videos.map((n) => n.eps.length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
  });

  it("有题库时每 2 个视频节点后有测验，且结尾必有总复习", () => {
    const track = buildLessonTrack(seq(20), true); // 5 个视频节点
    const quizzes = track.filter((n) => n.kind === "quiz");
    assert.equal(quizzes.length, 3); // 第 2、4 节后 + 结尾
    // 测验覆盖区间首尾相接、合起来是全部集
    assert.deepEqual(
      quizzes.flatMap((q) => q.eps),
      seq(20),
    );
    // 最后一个非宝箱节点是总复习测验
    const nonChest = track.filter((n) => n.kind !== "chest");
    assert.equal(nonChest[nonChest.length - 1].kind, "quiz");
  });

  it("无题库时没有测验节点", () => {
    const track = buildLessonTrack(seq(12), false);
    assert.equal(track.filter((n) => n.kind === "quiz").length, 0);
  });

  it("结尾必有通关宝箱，长课程中途有补给宝箱", () => {
    const short = buildLessonTrack(seq(6), true);
    assert.equal(short.filter((n) => n.kind === "chest").length, 1);
    assert.equal(short[short.length - 1].kind, "chest");

    const long = buildLessonTrack(seq(40), true); // 10 个视频节点
    const chests = long.filter((n) => n.kind === "chest");
    assert.equal(chests.length, 3); // 第 4、8 节后 + 结尾
    // 通关宝箱前提 = 全部集
    assert.deepEqual(chests[chests.length - 1].eps, seq(40));
  });

  it("单集课程也成立：1 视频 + 1 测验 + 1 宝箱", () => {
    const track = buildLessonTrack([1], true);
    assert.deepEqual(
      track.map((n) => n.kind),
      ["video", "quiz", "chest"],
    );
  });

  it("quiz/chest 的 index 连续，findTrackNode 能找到", () => {
    const track = buildLessonTrack(seq(40), true);
    const quizzes = track.filter((n) => n.kind === "quiz");
    quizzes.forEach((q, i) => assert.equal(q.index, i));
    const chests = track.filter((n) => n.kind === "chest");
    chests.forEach((c, i) => assert.equal(c.index, i));
    assert.equal(findTrackNode(track, "quiz", 1)?.kind, "quiz");
    assert.equal(findTrackNode(track, "chest", 99), undefined);
  });

  it("集号不必从 1 连续（保持传入顺序）", () => {
    const track = buildLessonTrack([3, 5, 8, 13], true);
    const videos = track.filter((n) => n.kind === "video");
    assert.deepEqual(
      videos.flatMap((n) => n.eps),
      [3, 5, 8, 13],
    );
  });
});
