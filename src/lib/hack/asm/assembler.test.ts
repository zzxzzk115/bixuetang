import assert from "node:assert/strict";
import { test } from "node:test";
import { assemble } from "./assembler";

function codeOf(src: string): number[] {
  const r = assemble(src);
  assert.equal(r.ok, true, JSON.stringify(!r.ok && r.errors));
  return r.ok ? [...r.code] : [];
}

test("A 指令：常量与预定义符号", () => {
  assert.deepEqual(codeOf("@2\n@SCREEN\n@R3\n@KBD"), [2, 0x4000, 3, 0x6000]);
});

test("C 指令黄金输出（规格样例）", () => {
  // D=A → 111 0110000 010 000
  assert.deepEqual(codeOf("D=A"), [0b1110110000010000]);
  // D=D+A → 111 0000010 010 000
  assert.deepEqual(codeOf("D=D+A"), [0b1110000010010000]);
  // M=M+1 → 111 1110111 001 000
  assert.deepEqual(codeOf("M=M+1"), [0b1111110111001000]);
  // D;JGT → 111 0001100 000 001
  assert.deepEqual(codeOf("D;JGT"), [0b1110001100000001]);
  // 0;JMP → 111 0101010 000 111
  assert.deepEqual(codeOf("0;JMP"), [0b1110101010000111]);
  // AMD=D|M;JNE
  assert.deepEqual(codeOf("AMD=D|M;JNE"), [0b1111010101111101]);
});

test("标签与变量分配：标签不占地址，变量从 16 起", () => {
  const r = assemble(
    ["@start", "(loop)", "@counter", "M=M+1", "@loop", "0;JMP", "(start)"].join(
      "\n",
    ),
  );
  assert.ok(r.ok);
  if (!r.ok) return;
  // 指令序列: @start(0) @counter(1) M=M+1(2) @loop(3) 0;JMP(4)
  assert.equal(r.code[0], 5); // start 标签在末尾，地址 5
  assert.equal(r.code[1], 16); // counter 是第一个变量
  assert.equal(r.code[3], 1); // loop 标签地址 1
});

test("变量分配顺序从 16 递增", () => {
  assert.deepEqual(codeOf("@x\n@y\n@x"), [16, 17, 16]);
});

test("注释与空白容忍", () => {
  assert.deepEqual(codeOf("  // 注释\n @5 // 内联\n\n D = A ; JGT "), [
    5,
    0b1110110000010001,
  ]);
});

test("错误带行号：非法 comp 与重复标签", () => {
  const r = assemble("(X)\n(X)\nD=Q");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.errors.some((e) => e.line === 2 && e.message.includes("重复")));
  assert.ok(r.errors.some((e) => e.line === 3 && e.message.includes("comp")));
});

test("sourceMap 指回源行", () => {
  const r = assemble("// c\n@1\n(L)\nD=A");
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual([...r.sourceMap], [2, 4]);
});
