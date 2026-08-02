import assert from "node:assert/strict";
import { test } from "node:test";
import { ComputeEngine } from "@cortex-js/compute-engine";
import { compilePlot, runOp } from "./engine";

const ce = new ComputeEngine();

test("求值：数值表达式", () => {
  const r = runOp(ce, "\\frac{3}{4}+\\frac{1}{4}", "evaluate");
  assert.ok(r.ok, JSON.stringify(r));
  if (r.ok) assert.equal(r.latex, "1");
});

test("化简：合并同类项", () => {
  const r = runOp(ce, "x+x+2x", "simplify");
  assert.ok(r.ok);
  if (r.ok) assert.ok(r.latex.includes("4"), r.latex);
});

test("求导：x^2 → 2x", () => {
  const r = runOp(ce, "x^2", "derivative");
  assert.ok(r.ok);
  if (r.ok) assert.ok(/2\s*x|2x/.test(r.latex), r.latex);
});

test("求导：sin(x) → cos(x)", () => {
  const r = runOp(ce, "\\sin(x)", "derivative");
  assert.ok(r.ok);
  if (r.ok) assert.ok(r.latex.includes("cos"), r.latex);
});

test("非法表达式返回错误而非抛出", () => {
  const r = runOp(ce, "\\frac{1}{", "evaluate");
  assert.equal(r.ok, false);
});

test("compilePlot：sin(x) 可采样", () => {
  const f = compilePlot(ce, "\\sin(x)");
  assert.ok(f);
  if (!f) return;
  assert.ok(Math.abs(f(0)) < 1e-9);
  assert.ok(Math.abs(f(Math.PI / 2) - 1) < 1e-9);
});

test("compilePlot：含 y 自由变量拒绝", () => {
  assert.equal(compilePlot(ce, "x+y"), null);
});
