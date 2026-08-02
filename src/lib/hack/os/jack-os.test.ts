import assert from "node:assert/strict";
import { test } from "node:test";
import { createMachine, run, HALT_MAGIC, type HackMachine } from "../cpu/machine";
import { SCREEN_BASE } from "../defs";
import { build } from "../pipeline";
import { HACK_DEMOS } from "../demos";

// 纯血模式：Jack 写的 OS 与用户代码一起编译，OS 调用不再走 TS trap。
// 这些测试验证软件实现的乘除法、堆分配、绘图确实跑在模拟 CPU 上。

/**
 * 纯血模式下 Sys.halt 是 Jack 的 while(true){}，CPU 不会真正停机（只会被标记 spinning），
 * 所以这里跑固定步数后直接检查内存，而不是等 halted。
 */
function runPure(source: string, maxSteps = 20_000_000): HackMachine {
  const r = build([{ name: "Main.jack", source }], { pureJackOs: true });
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  if (!r.ok) throw new Error("unreachable");
  // 纯血模式下不应注册任何 trap
  assert.equal(r.traps.size, 0, "纯血模式不应有 trap");
  const m = createMachine(r.rom);
  run(m, maxSteps, r.traps);
  return m;
}

test("纯血模式编译通过且零 trap", () => {
  const r = build(
    [{ name: "Main.jack", source: `class Main { function void main() { return; } }` }],
    { pureJackOs: true },
  );
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  if (!r.ok) return;
  assert.equal(r.traps.size, 0);
  // Jack OS 编译进来后 ROM 明显更大
  assert.ok(r.rom.length > 3000, `ROM 只有 ${r.rom.length} 条指令，OS 似乎没编进去`);
});

test("软件乘法：Math.multiply 位移相加", () => {
  const m = runPure(`
class Main {
  function void main() {
    var int r;
    let r = 123 * 45;
    do Memory.poke(100, r);
    return;
  }
}`);
  assert.equal(m.ram[100], 5535);
});

test("软件除法与负数符号", () => {
  const m = runPure(`
class Main {
  function void main() {
    do Memory.poke(100, 1000 / 7);
    do Memory.poke(101, (-100) / 8);
    do Memory.poke(102, Math.abs(-42));
    return;
  }
}`);
  assert.equal(m.ram[100], 142); // 1000/7 = 142.857 → 142
  assert.equal(m.ram[101], -12); // -100/8 = -12.5 → -12
  assert.equal(m.ram[102], 42);
});

test("Math.sqrt 二分逼近", () => {
  const m = runPure(`
class Main {
  function void main() {
    do Memory.poke(100, Math.sqrt(144));
    do Memory.poke(101, Math.sqrt(1000));
    return;
  }
}`);
  assert.equal(m.ram[100], 12);
  assert.equal(m.ram[101], 31); // floor(sqrt(1000)) = 31
});

test("Jack 实现的堆分配与数组", () => {
  const m = runPure(`
class Main {
  function void main() {
    var Array a;
    var int i, sum;
    let a = Array.new(6);
    let i = 0;
    while (i < 6) {
      let a[i] = i * i;
      let i = i + 1;
    }
    let sum = a[2] + a[5];
    do Memory.poke(100, sum);
    return;
  }
}`);
  assert.equal(m.ram[100], 29); // 4 + 25
});

test("Jack 实现的 String 与 setInt", () => {
  const m = runPure(`
class Main {
  function void main() {
    var String s;
    let s = String.new(8);
    do s.setInt(-407);
    do Memory.poke(100, s.length());
    do Memory.poke(101, s.charAt(0));
    do Memory.poke(102, s.intValue());
    return;
  }
}`);
  assert.equal(m.ram[100], 4); // "-407"
  assert.equal(m.ram[101], 45); // '-'
  assert.equal(m.ram[102], -407);
});

test("Jack 实现的 Screen 绘图直接写屏幕内存", () => {
  const m = runPure(`
class Main {
  function void main() {
    do Screen.setColor(true);
    do Screen.drawPixel(3, 0);
    do Screen.drawPixel(16, 1);
    do Screen.drawLine(0, 2, 15, 2);
    return;
  }
}`);
  // 屏幕每行 32 个 word，每 word 16 像素：(x,y) → SCREEN_BASE + y*32 + x/16，位 = x%16
  assert.equal(m.ram[SCREEN_BASE] & 0x8, 0x8, "(3,0) 应点亮第 0 个 word 的第 3 位");
  assert.equal(
    m.ram[SCREEN_BASE + 32 + 1] & 1,
    1,
    "(16,1) 应点亮第 1 行第 1 个 word 的第 0 位",
  );
  assert.equal(
    m.ram[SCREEN_BASE + 64] & 0xffff,
    0xffff,
    "(0,2)-(15,2) 水平线应填满第 2 行首个 word",
  );
});

test("停机约定：Sys.halt 写 R15 魔数后模拟器识别为已停机", () => {
  const m = runPure(`
class Main {
  function void main() {
    do Memory.poke(300, 7);
    return;
  }
}`);
  assert.equal(m.ram[300], 7, "main 应已执行完");
  assert.ok(m.halted, "Sys.halt 后应停机而不是空转");
  assert.equal(m.ram[15], HALT_MAGIC);
});

test("内置 Jack demo 在纯血模式下也能编译", () => {
  for (const demo of HACK_DEMOS.filter((d) => d.kind === "jack")) {
    const r = build(demo.files, { pureJackOs: true });
    assert.ok(r.ok, `${demo.id}: ${JSON.stringify(!r.ok && r.errors)}`);
    if (r.ok) assert.equal(r.traps.size, 0);
  }
});

test("原生模式仍走 trap（对照）", () => {
  const r = build(
    [
      {
        name: "Main.jack",
        source: `class Main { function void main() { do Memory.poke(100, 6 * 7); return; } }`,
      },
    ],
    { pureJackOs: false },
  );
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.ok(r.traps.size > 0, "原生模式应注册 trap");
  const m = createMachine(r.rom);
  run(m, 1_000_000, r.traps);
  assert.equal(m.ram[100], 42);
});
