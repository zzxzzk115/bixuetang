import assert from "node:assert/strict";
import { test } from "node:test";
import { assemble } from "../asm/assembler";
import { KBD, SCREEN_BASE } from "../defs";
import { createMachine, run, step } from "./machine";

function machineFor(src: string) {
  const r = assemble(src);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  if (!r.ok) throw new Error("unreachable");
  return createMachine(r.code);
}

test("加法：2+3 存 R0", () => {
  const m = machineFor("@2\nD=A\n@3\nD=D+A\n@0\nM=D");
  run(m, 100);
  assert.equal(m.ram[0], 5);
});

test("有符号运算与负数回绕", () => {
  const m = machineFor("@1\nD=A\nD=-D\n@0\nM=D\n@32767\nD=A\nD=D+1\n@1\nM=D");
  run(m, 100);
  assert.equal(m.ram[0], -1);
  assert.equal(m.ram[1], -32768); // 32767+1 溢出回绕
});

test("条件跳转：max(R0,R1) → R2", () => {
  const src = `
@0
D=M
@1
D=D-M
@TAKE0
D;JGT
@1
D=M
@STORE
0;JMP
(TAKE0)
@0
D=M
(STORE)
@2
M=D
(END)
@END
0;JMP`;
  const m1 = machineFor(src);
  m1.ram[0] = 7;
  m1.ram[1] = 42;
  run(m1, 1000);
  assert.equal(m1.ram[2], 42);

  const m2 = machineFor(src);
  m2.ram[0] = 99;
  m2.ram[1] = -5;
  run(m2, 1000);
  assert.equal(m2.ram[2], 99);
});

test("循环累加 1..10 = 55 且自动停机", () => {
  const src = `
@i
M=1
@sum
M=0
(LOOP)
@i
D=M
@11
D=D-A
@DONE
D;JEQ
@i
D=M
@sum
M=M+D
@i
M=M+1
@LOOP
0;JMP
(DONE)
@0
D=M
(END)
@END
0;JMP`;
  const m = machineFor(src);
  const { steps } = run(m, 100000);
  assert.equal(m.ram[17], 55); // sum 是第二个变量（i=16, sum=17）
  assert.ok(m.halted, "应检测到收尾自旋并停机");
  assert.ok(steps < 500, `steps=${steps}`);
});

test("屏幕写入置脏标记，键盘内存可读", () => {
  const m = machineFor(`
@KBD
D=M
@0
M=D
@SCREEN
M=-1`);
  m.ram[KBD] = 65;
  m.screenDirty = false;
  run(m, 100);
  assert.equal(m.ram[0], 65);
  assert.equal(m.ram[SCREEN_BASE], -1);
  assert.ok(m.screenDirty);
});

test("单步：A/D/PC 逐步变化", () => {
  const m = machineFor("@7\nD=A");
  step(m);
  assert.equal(m.a, 7);
  assert.equal(m.pc, 1);
  step(m);
  assert.equal(m.d, 7);
  assert.equal(m.pc, 2);
});
