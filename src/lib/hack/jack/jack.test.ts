import assert from "node:assert/strict";
import { test } from "node:test";
import { createMachine, run, type HackMachine } from "../cpu/machine";
import { SCREEN_BASE } from "../defs";
import { build } from "../pipeline";
import { HACK_DEMOS } from "../demos";
import { parseJack } from "./parser";
import { tokenize } from "./tokenizer";

/** Jack 源码 → 全链路执行 → 机器终态（返回值在 RAM[256]） */
function runJack(source: string, maxSteps = 5_000_000): HackMachine {
  const r = build([{ name: "Main.jack", source }]);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  if (!r.ok) throw new Error("unreachable");
  const m = createMachine(r.rom);
  run(m, maxSteps, r.traps);
  return m;
}

test("tokenizer：注释/字符串/符号/整数", () => {
  const t = tokenize(
    `class A { // 行注释\n/* 块 */ let s = "hi 中"; let n = 42; }`,
    "A.jack",
  );
  assert.ok(t.ok);
  if (!t.ok) return;
  const values = t.tokens.map((x) => x.value);
  assert.deepEqual(values, ["class", "A", "{", "let", "s", "=", "hi 中", ";", "let", "n", "=", "42", ";", "}"]);
});

test("parser：语法错误带行号", () => {
  const t = tokenize("class A {\n  function void f() {\n    let = 3;\n  }\n}", "A.jack");
  assert.ok(t.ok);
  if (!t.ok) return;
  const p = parseJack(t.tokens, "A.jack");
  assert.equal(p.ok, false);
  if (p.ok) return;
  assert.equal(p.errors[0].line, 3);
});

test("表达式与运算：无优先级左结合 2+3*4 = 20", () => {
  const m = runJack(`
class Main {
  function int main() {
    return 2 + 3 * 4;   // Jack 左结合：(2+3)*4
  }
}`);
  assert.equal(m.ram[256], 20);
});

test("while/if/递归：fib(10)=55", () => {
  const m = runJack(`
class Main {
  function int main() {
    return Main.fib(10);
  }
  function int fib(int n) {
    if (n < 2) { return n; }
    return Main.fib(n - 1) + Main.fib(n - 2);
  }
}`);
  assert.equal(m.ram[256], 55);
});

test("字段/构造器/方法：Point 对象求曼哈顿距离（多文件）", () => {
  const r = build([
    {
      name: "Main.jack",
      source: `
class Main {
  function int main() {
    var Point p;
    let p = Point.new(3, 4);
    return p.manhattan();
  }
}`,
    },
    {
      name: "Point.jack",
      source: `
class Point {
  field int x, y;
  constructor Point new(int ax, int ay) {
    let x = ax;
    let y = ay;
    return this;
  }
  method int manhattan() {
    return Math.abs(x) + Math.abs(y);
  }
}`,
    },
  ]);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  if (!r.ok) return;
  const m = createMachine(r.rom);
  run(m, 5_000_000, r.traps);
  assert.equal(m.ram[256], 7);
});

test("数组读写", () => {
  const m = runJack(`
class Main {
  function int main() {
    var Array a;
    var int i, sum;
    let a = Array.new(5);
    let i = 0;
    while (i < 5) {
      let a[i] = i * 10;
      let i = i + 1;
    }
    let sum = a[1] + a[4];
    return sum;
  }
}`);
  assert.equal(m.ram[256], 50);
});

test("字符串常量经 String.new/appendChar 构造", () => {
  const m = runJack(`
class Main {
  function int main() {
    var String s;
    let s = "AB";
    return s.length();
  }
}`);
  assert.equal(m.ram[256], 2);
});

test("Screen OS 调用：drawRectangle 涂黑区域", () => {
  const m = runJack(`
class Main {
  function void main() {
    do Screen.setColor(true);
    do Screen.drawRectangle(0, 0, 15, 0);
    return;
  }
}`);
  assert.equal(m.ram[SCREEN_BASE] & 0xffff, 0xffff); // 首 word 16 像素全黑
});

test("内置 Jack demo 全部可编译", () => {
  for (const demo of HACK_DEMOS.filter((d) => d.kind === "jack")) {
    const r = build(demo.files);
    assert.ok(r.ok, `${demo.id}: ${JSON.stringify(!r.ok && r.errors)}`);
  }
});
