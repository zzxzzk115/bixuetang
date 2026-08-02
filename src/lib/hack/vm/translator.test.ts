import assert from "node:assert/strict";
import { test } from "node:test";
import { createMachine, run } from "../cpu/machine";
import { linkUnits } from "../pipeline";
import { parseVm } from "./parser";
import type { VmUnit } from "./translator";

/** VM 源码 → 全链路（翻译→汇编→CPU 执行）→ 机器终态 */
function runVm(sources: Record<string, string>, maxSteps = 2_000_000) {
  const units: VmUnit[] = Object.entries(sources).map(([name, src]) => {
    const p = parseVm(src);
    assert.ok(p.ok, JSON.stringify(!p.ok && p.errors));
    if (!p.ok) throw new Error("unreachable");
    return { name, commands: p.commands };
  });
  const built = linkUnits(units, {});
  assert.ok(built.ok, JSON.stringify(!built.ok && built.errors));
  if (!built.ok) throw new Error("unreachable");
  const m = createMachine(built.rom);
  run(m, maxSteps, built.traps);
  return m;
}

test("栈算术：(7+2)*3-4 经 push/add/call Math.multiply/sub", () => {
  const m = runVm({
    Main: `
function Main.main 0
push constant 7
push constant 2
add
push constant 3
call Math.multiply 2
push constant 4
sub
return`,
  });
  // 返回值写在 ARG（bootstrap 帧 ARG=256）
  assert.equal(m.ram[256], 23);
  assert.ok(m.halted);
});

test("比较与逻辑：eq/gt/lt 产生 0/-1", () => {
  const m = runVm({
    Main: `
function Main.main 0
push constant 5
push constant 5
eq
pop static 0
push constant 9
push constant 3
gt
pop static 1
push constant 9
push constant 3
lt
pop static 2
push constant 0
return`,
  });
  assert.equal(m.ram[16], -1); // 5==5 → true(-1)
  assert.equal(m.ram[17], -1); // 9>3
  assert.equal(m.ram[18], 0); // 9<3 → false
});

test("local/argument 段与函数调用返回", () => {
  const m = runVm({
    Main: `
function Main.main 1
push constant 12
push constant 30
call Main.addBoth 2
pop local 0
push local 0
return
function Main.addBoth 0
push argument 0
push argument 1
add
return`,
  });
  assert.equal(m.ram[256], 42);
});

test("if-goto / label / goto：循环求和 1..5", () => {
  const m = runVm({
    Main: `
function Main.main 2
push constant 0
pop local 0    // sum
push constant 1
pop local 1    // i
label LOOP
push local 1
push constant 5
gt
if-goto DONE
push local 0
push local 1
add
pop local 0
push local 1
push constant 1
add
pop local 1
goto LOOP
label DONE
push local 0
return`,
  });
  assert.equal(m.ram[256], 15);
});

test("this/that/pointer 段与 Memory.alloc", () => {
  const m = runVm({
    Main: `
function Main.main 1
push constant 3
call Memory.alloc 1
pop local 0
push local 0
pop pointer 0     // THIS = 分配块
push constant 111
pop this 0
push constant 222
pop this 2
push this 0
push this 2
add
return`,
  });
  assert.equal(m.ram[256], 333);
  assert.equal(m.ram[2048], 111); // 堆基址
  assert.equal(m.ram[2050], 222);
});

test("递归：fib(10)=55（真实栈帧）", () => {
  const m = runVm({
    Main: `
function Main.main 0
push constant 10
call Main.fib 1
return
function Main.fib 0
push argument 0
push constant 2
lt
if-goto BASE
push argument 0
push constant 1
sub
call Main.fib 1
push argument 0
push constant 2
sub
call Main.fib 1
add
return
label BASE
push argument 0
return`,
  });
  assert.equal(m.ram[256], 55);
});

test("原生 OS trap：Math.sqrt 与 Screen.drawPixel 写屏", () => {
  const m = runVm({
    Main: `
function Main.main 0
push constant 144
call Math.sqrt 1
pop static 0
push constant 0
push constant 0
call Screen.drawPixel 2
pop temp 0
push constant 0
return`,
  });
  assert.equal(m.ram[16], 12);
  assert.equal(m.ram[0x4000] & 1, 1); // (0,0) 像素置位
});

test("未定义函数报错而非静默", () => {
  const p = parseVm("function Main.main 0\ncall No.such 0\nreturn");
  assert.ok(p.ok);
  if (!p.ok) return;
  const built = linkUnits([{ name: "Main", commands: p.commands }], {});
  assert.equal(built.ok, false);
  if (built.ok) return;
  assert.ok(built.errors.some((e) => e.message.includes("No.such")));
});
