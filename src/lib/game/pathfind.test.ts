import assert from "node:assert/strict";
import { test } from "node:test";
import { findPath, nearestWalkable } from "./pathfind";
import { walkableGrid, parseHall } from "./hall-map";

// 小地图便于手推：. 可走 # 墙
function grid(rows: string[]): boolean[][] {
  return rows.map((r) => [...r].map((c) => c === "."));
}

test("直线最短路含起终点", () => {
  const g = grid(["....."]);
  const path = findPath(g, { col: 0, row: 0 }, { col: 4, row: 0 });
  assert.ok(path);
  assert.equal(path.length, 5);
  assert.deepEqual(path[0], { col: 0, row: 0 });
  assert.deepEqual(path[4], { col: 4, row: 0 });
});

test("绕过墙", () => {
  const g = grid([
    ".....",
    ".###.",
    ".....",
  ]);
  const path = findPath(g, { col: 0, row: 1 }, { col: 4, row: 1 });
  if (!path) throw new Error("应有绕行路径");
  // 中间一排被墙堵，必须绕上或绕下，长度大于直线的 5
  assert.ok(path.length > 5);
  // 路径每一步都可走且四连通
  for (let i = 1; i < path.length; i++) {
    const d: number =
      Math.abs(path[i].col - path[i - 1].col) +
      Math.abs(path[i].row - path[i - 1].row);
    assert.equal(d, 1, "相邻步必须四连通");
    assert.ok(g[path[i].row][path[i].col], "每格必须可走");
  }
});

test("无路可达返回 null", () => {
  const g = grid([
    "..#..",
    "..#..",
    "..#..",
  ]);
  assert.equal(findPath(g, { col: 0, row: 0 }, { col: 4, row: 0 }), null);
});

test("同格返回单元素路径", () => {
  const g = grid([".."]);
  assert.deepEqual(findPath(g, { col: 1, row: 0 }, { col: 1, row: 0 }), [
    { col: 1, row: 0 },
  ]);
});

test("点到墙里时吸附到最近可走格", () => {
  const g = grid([
    "...",
    ".#.",
    "...",
  ]);
  // 目标是中心墙格
  const near = nearestWalkable(g, { col: 1, row: 1 });
  assert.ok(near);
  assert.ok(g[near.row][near.col], "吸附结果必须可走");
  // findPath 到墙格也应成功（内部吸附）
  const path = findPath(g, { col: 0, row: 0 }, { col: 1, row: 1 });
  assert.ok(path);
});

test("同输入完全可复现", () => {
  const g = grid([".....", ".###.", "....."]);
  const a = findPath(g, { col: 0, row: 0 }, { col: 4, row: 2 });
  const b = findPath(g, { col: 0, row: 0 }, { col: 4, row: 2 });
  assert.deepEqual(a, b);
});

test("真实大厅地图：出生点可达每个 POI", () => {
  const g = walkableGrid();
  const { spawn, pois } = parseHall();
  assert.ok(pois.length >= 6, "应有至少 6 个据点");
  for (const poi of pois) {
    const path = findPath(g, spawn, { col: poi.col, row: poi.row });
    assert.ok(path, `出生点应能走到 ${poi.kind}`);
  }
});
