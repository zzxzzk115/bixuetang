// TS 原生 Jack OS：CPU 级 trap 实现。
// 用户代码经 Jack→VM→asm 全链路真实跑在模拟 CPU 上；对 OS 函数的 call
// 落到 ROM 尾部 stub 地址时由这里接管：按 Hack 调用约定读 ARG、执行原生逻辑、
// 写返回值并恢复调用者帧。Screen 直接写 ram 屏幕区，与内存映射语义一致。

import { ARG, int16, KBD, LCL, SCREEN_BASE, SCREEN_WORDS, SP, THAT, THIS } from "../defs";
import type { HackMachine, TrapHandler } from "../cpu/machine";
import { CELL_H, CELL_W, glyphOf, TEXT_COLS, TEXT_ROWS } from "./font";

// ---------- 每台机器的 OS 侧状态（颜色/光标/堆指针） ----------

interface OsState {
  color: boolean;
  cursorRow: number;
  cursorCol: number;
  heapPtr: number;
}

const HEAP_BASE = 2048;
const HEAP_END = 16384;

const osStates = new WeakMap<HackMachine, OsState>();

function stateOf(m: HackMachine): OsState {
  let s = osStates.get(m);
  if (!s) {
    s = { color: true, cursorRow: 0, cursorCol: 0, heapPtr: HEAP_BASE };
    osStates.set(m, s);
  }
  return s;
}

// ---------- 调用约定 ----------

/** 完成 return：写返回值、恢复调用者帧（trap 触发时 call 序列已建好帧） */
function doReturn(m: HackMachine, value: number): void {
  const frame = m.ram[LCL];
  const retAddr = m.ram[frame - 5] & 0x7fff;
  const argBase = m.ram[ARG];
  m.ram[argBase] = int16(value);
  m.ram[SP] = argBase + 1;
  m.ram[THAT] = m.ram[frame - 1];
  m.ram[THIS] = m.ram[frame - 2];
  m.ram[ARG] = m.ram[frame - 3];
  m.ram[LCL] = m.ram[frame - 4];
  m.pc = retAddr;
}

type NativeFn = (m: HackMachine, args: number[]) => number | void;

function trap(argCount: number, fn: NativeFn): TrapHandler {
  return (m) => {
    const base = m.ram[ARG];
    const args: number[] = [];
    for (let i = 0; i < argCount; i++) args.push(m.ram[base + i]);
    const ret = fn(m, args);
    doReturn(m, typeof ret === "number" ? ret : 0);
  };
}

// ---------- 绘图原语 ----------

function setPixel(m: HackMachine, x: number, y: number, on: boolean): void {
  if (x < 0 || x > 511 || y < 0 || y > 255) return;
  const addr = SCREEN_BASE + y * 32 + (x >> 4);
  const bit = 1 << (x & 15);
  if (on) m.ram[addr] |= bit;
  else m.ram[addr] &= ~bit;
  m.screenDirty = true;
}

function drawHorizontal(m: HackMachine, x1: number, x2: number, y: number, on: boolean): void {
  const lo = Math.max(0, Math.min(x1, x2));
  const hi = Math.min(511, Math.max(x1, x2));
  for (let x = lo; x <= hi; x++) setPixel(m, x, y, on);
}

function drawLine(m: HackMachine, x1: number, y1: number, x2: number, y2: number, on: boolean): void {
  // Bresenham
  let x = x1, y = y1;
  const dx = Math.abs(x2 - x1), dy = -Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    setPixel(m, x, y, on);
    if (x === x2 && y === y2) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

function drawChar(m: HackMachine, row: number, col: number, charCode: number): void {
  if (row < 0 || row >= TEXT_ROWS || col < 0 || col >= TEXT_COLS) return;
  const x0 = col * CELL_W;
  const y0 = row * CELL_H;
  // 清格
  for (let y = 0; y < CELL_H; y++) {
    for (let x = 0; x < CELL_W; x++) setPixel(m, x0 + x, y0 + y, false);
  }
  const glyph = glyphOf(charCode);
  for (let c = 0; c < glyph.length; c++) {
    const bits = glyph[c];
    for (let r = 0; r < 7; r++) {
      if ((bits >> r) & 1) setPixel(m, x0 + 1 + c, y0 + 2 + r, true);
    }
  }
}

// ---------- 字符串对象（native 内部布局：[capacity, length, chars...]） ----------

function strLen(m: HackMachine, ptr: number): number {
  return m.ram[ptr + 1];
}
function strChars(m: HackMachine, ptr: number): number[] {
  const len = strLen(m, ptr);
  const out: number[] = [];
  for (let i = 0; i < len; i++) out.push(m.ram[ptr + 2 + i]);
  return out;
}

function outputChar(m: HackMachine, code: number): void {
  const s = stateOf(m);
  drawChar(m, s.cursorRow, s.cursorCol, code);
  s.cursorCol++;
  if (s.cursorCol >= TEXT_COLS) {
    s.cursorCol = 0;
    s.cursorRow = (s.cursorRow + 1) % TEXT_ROWS;
  }
}

function outputString(m: HackMachine, text: string): void {
  for (const ch of text) outputChar(m, ch.charCodeAt(0));
}

// ---------- 原生 OS 函数注册表 ----------

export const NATIVE_OS: Record<string, { args: number; handler: TrapHandler }> = {
  // Math
  "Math.multiply": { args: 2, handler: trap(2, (_m, [a, b]) => int16(Math.imul(a, b))) },
  "Math.divide": {
    args: 2,
    handler: trap(2, (m, [a, b]) => {
      if (b === 0) { m.halted = true; return 0; }
      return int16(Math.trunc(a / b));
    }),
  },
  "Math.min": { args: 2, handler: trap(2, (_m, [a, b]) => Math.min(a, b)) },
  "Math.max": { args: 2, handler: trap(2, (_m, [a, b]) => Math.max(a, b)) },
  "Math.abs": { args: 1, handler: trap(1, (_m, [a]) => Math.abs(int16(a))) },
  "Math.sqrt": { args: 1, handler: trap(1, (_m, [a]) => (a <= 0 ? 0 : Math.floor(Math.sqrt(a)))) },

  // Memory
  "Memory.peek": { args: 1, handler: trap(1, (m, [addr]) => m.ram[addr & 0x7fff]) },
  "Memory.poke": {
    args: 2,
    handler: trap(2, (m, [addr, v]) => {
      const a = addr & 0x7fff;
      m.ram[a] = int16(v);
      if (a >= SCREEN_BASE && a < SCREEN_BASE + SCREEN_WORDS) m.screenDirty = true;
    }),
  },
  "Memory.alloc": {
    args: 1,
    handler: trap(1, (m, [size]) => {
      const s = stateOf(m);
      const n = Math.max(1, size);
      if (s.heapPtr + n >= HEAP_END) { m.halted = true; return 0; } // 堆耗尽
      const ptr = s.heapPtr;
      s.heapPtr += n;
      return ptr;
    }),
  },
  "Memory.deAlloc": { args: 1, handler: trap(1, () => 0) }, // bump allocator 不回收

  // Screen
  "Screen.clearScreen": {
    args: 0,
    handler: trap(0, (m) => {
      m.ram.fill(0, SCREEN_BASE, SCREEN_BASE + SCREEN_WORDS);
      m.screenDirty = true;
    }),
  },
  "Screen.setColor": {
    args: 1,
    handler: trap(1, (m, [b]) => { stateOf(m).color = b !== 0; }),
  },
  "Screen.drawPixel": {
    args: 2,
    handler: trap(2, (m, [x, y]) => setPixel(m, x, y, stateOf(m).color)),
  },
  "Screen.drawLine": {
    args: 4,
    handler: trap(4, (m, [x1, y1, x2, y2]) => drawLine(m, x1, y1, x2, y2, stateOf(m).color)),
  },
  "Screen.drawRectangle": {
    args: 4,
    handler: trap(4, (m, [x1, y1, x2, y2]) => {
      const on = stateOf(m).color;
      const lo = Math.max(0, Math.min(y1, y2));
      const hi = Math.min(255, Math.max(y1, y2));
      for (let y = lo; y <= hi; y++) drawHorizontal(m, x1, x2, y, on);
    }),
  },
  "Screen.drawCircle": {
    args: 3,
    handler: trap(3, (m, [cx, cy, r]) => {
      const on = stateOf(m).color;
      const rr = Math.min(Math.abs(r), 181);
      for (let dy = -rr; dy <= rr; dy++) {
        const half = Math.floor(Math.sqrt(rr * rr - dy * dy));
        drawHorizontal(m, cx - half, cx + half, cy + dy, on);
      }
    }),
  },

  // Output
  "Output.moveCursor": {
    args: 2,
    handler: trap(2, (m, [row, col]) => {
      const s = stateOf(m);
      s.cursorRow = Math.max(0, Math.min(TEXT_ROWS - 1, row));
      s.cursorCol = Math.max(0, Math.min(TEXT_COLS - 1, col));
    }),
  },
  "Output.printChar": { args: 1, handler: trap(1, (m, [c]) => outputChar(m, c)) },
  "Output.printString": {
    args: 1,
    handler: trap(1, (m, [ptr]) => {
      for (const c of strChars(m, ptr)) outputChar(m, c);
    }),
  },
  "Output.printInt": {
    args: 1,
    handler: trap(1, (m, [v]) => outputString(m, String(int16(v)))),
  },
  "Output.println": {
    args: 0,
    handler: trap(0, (m) => {
      const s = stateOf(m);
      s.cursorCol = 0;
      s.cursorRow = (s.cursorRow + 1) % TEXT_ROWS;
    }),
  },
  "Output.backSpace": {
    args: 0,
    handler: trap(0, (m) => {
      const s = stateOf(m);
      s.cursorCol = Math.max(0, s.cursorCol - 1);
      drawChar(m, s.cursorRow, s.cursorCol, 32);
    }),
  },

  // Keyboard
  "Keyboard.keyPressed": { args: 0, handler: trap(0, (m) => m.ram[KBD]) },
  "Keyboard.readChar": { args: 0, handler: trap(0, (m) => m.ram[KBD]) }, // 非阻塞近似

  // String（native 布局 [capacity, length, chars...]）
  "String.new": {
    args: 1,
    handler: trap(1, (m, [maxLen]) => {
      const s = stateOf(m);
      const cap = Math.max(1, maxLen);
      if (s.heapPtr + cap + 2 >= HEAP_END) { m.halted = true; return 0; }
      const ptr = s.heapPtr;
      s.heapPtr += cap + 2;
      m.ram[ptr] = cap;
      m.ram[ptr + 1] = 0;
      return ptr;
    }),
  },
  "String.dispose": { args: 1, handler: trap(1, () => 0) },
  "String.length": { args: 1, handler: trap(1, (m, [p]) => strLen(m, p)) },
  "String.charAt": { args: 2, handler: trap(2, (m, [p, j]) => m.ram[p + 2 + j]) },
  "String.setCharAt": {
    args: 3,
    handler: trap(3, (m, [p, j, c]) => { m.ram[p + 2 + j] = int16(c); }),
  },
  "String.appendChar": {
    args: 2,
    handler: trap(2, (m, [p, c]) => {
      const len = m.ram[p + 1];
      if (len < m.ram[p]) {
        m.ram[p + 2 + len] = int16(c);
        m.ram[p + 1] = len + 1;
      }
      return p;
    }),
  },
  "String.eraseLastChar": {
    args: 1,
    handler: trap(1, (m, [p]) => { m.ram[p + 1] = Math.max(0, m.ram[p + 1] - 1); }),
  },
  "String.intValue": {
    args: 1,
    handler: trap(1, (m, [p]) => {
      const text = strChars(m, p).map((c) => String.fromCharCode(c)).join("");
      return int16(parseInt(text, 10) || 0);
    }),
  },
  "String.setInt": {
    args: 2,
    handler: trap(2, (m, [p, v]) => {
      const text = String(int16(v));
      m.ram[p + 1] = 0;
      for (const ch of text) {
        const len = m.ram[p + 1];
        if (len >= m.ram[p]) break;
        m.ram[p + 2 + len] = ch.charCodeAt(0);
        m.ram[p + 1] = len + 1;
      }
    }),
  },
  "String.backSpace": { args: 0, handler: trap(0, () => 129) },
  "String.doubleQuote": { args: 0, handler: trap(0, () => 34) },
  "String.newLine": { args: 0, handler: trap(0, () => 128) },

  // Array
  "Array.new": {
    args: 1,
    handler: trap(1, (m, [size]) => {
      const s = stateOf(m);
      const n = Math.max(1, size);
      if (s.heapPtr + n >= HEAP_END) { m.halted = true; return 0; }
      const ptr = s.heapPtr;
      s.heapPtr += n;
      return ptr;
    }),
  },
  "Array.dispose": { args: 1, handler: trap(1, () => 0) },

  // Sys
  "Sys.halt": { args: 0, handler: (m) => { m.halted = true; } },
  "Sys.wait": {
    args: 1,
    handler: trap(1, (m, [ms]) => { m.pendingWaitMs += Math.max(0, ms); }),
  },
  "Sys.error": {
    args: 1,
    handler: (m) => {
      const base = m.ram[ARG];
      outputString(m, `ERR ${m.ram[base]}`);
      m.halted = true;
    },
  },
};
