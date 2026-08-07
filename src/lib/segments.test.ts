import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  buildSegments,
  firstUnfinishedSegment,
  mergeCoverage,
  segmentCoverage,
} from "./segments";

const HOUR = 3600;

test("短视频不分段", () => {
  assert.deepEqual(buildSegments({ durationSec: 20 * 60 }), []);
});

test("view_points 优先,最后一段兜到片尾", () => {
  const segs = buildSegments({
    durationSec: HOUR,
    viewPoints: [
      { content: "开场", from: 0, to: 600 },
      { content: "正题", from: 600, to: 2400 },
      { content: "答疑", from: 2400, to: 3500 }, // 没盖满
    ],
    keyPoints: [{ t: 100, title: "不该被用到" }],
  });
  assert.equal(segs.length, 3);
  assert.equal(segs[0].title, "开场");
  assert.equal(segs[2].to, HOUR);
});

test("单个 view_point 不够,退到关键点边界并合并相近点", () => {
  const segs = buildSegments({
    durationSec: HOUR,
    viewPoints: [{ content: "唯一章节", from: 0, to: HOUR }],
    keyPoints: [
      { t: 300, title: "A" },
      { t: 360, title: "A2(距 A 太近,合并)" },
      { t: 1500, title: "B" },
      { t: 3000, title: "C" },
    ],
  });
  assert.deepEqual(
    segs.map((s) => [s.title, s.from]),
    [
      ["开场", 0],
      ["A", 300],
      ["B", 1500],
      ["C", 3000],
    ],
  );
  assert.equal(segs[3].to, HOUR);
});

test("没有任何标注:600 秒等分,短尾段并入前段", () => {
  const segs = buildSegments({ durationSec: 3700 });
  // 3700/600 = 6 段,最后一段 3000-3700
  assert.equal(segs.length, 6);
  assert.equal(segs[5].to, 3700);
  const short = buildSegments({ durationSec: 3100 });
  // 5 桶,尾段 2400-3100(700s ≥180 保留)——改用会触发合并的时长
  assert.equal(short[short.length - 1].to, 3100);
});

test("覆盖率按段统计,跳着看也算", () => {
  const segs = buildSegments({
    durationSec: HOUR,
    viewPoints: [
      { content: "上", from: 0, to: 1800 },
      { content: "下", from: 1800, to: 3600 },
    ],
  });
  const seen = new Set<number>();
  for (let s = 0; s < 1800; s++) seen.add(s); // 上半场全看
  for (let s = 1800; s < 1980; s++) seen.add(s); // 下半场看 10%
  const cov = segmentCoverage(seen, segs);
  assert.equal(cov[0], 100);
  assert.equal(cov[1], 10);
  assert.deepEqual(mergeCoverage([50, 20], [30, 80]), [50, 80]);
  assert.equal(firstUnfinishedSegment([100, 10]), 1);
  assert.equal(firstUnfinishedSegment([95, 92]), -1);
});
