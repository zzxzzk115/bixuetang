// Hack 平台共享常量（nand2tetris 规格）

export const RAM_SIZE = 32768; // 0x0000–0x7FFF（含屏幕与键盘映射区）
export const ROM_SIZE = 32768;

export const SCREEN_BASE = 0x4000; // 512×256 单色，8K words
export const SCREEN_WORDS = 8192;
export const KBD = 0x6000;

export const SCREEN_W = 512;
export const SCREEN_H = 256;

// 段指针寄存器地址
export const SP = 0;
export const LCL = 1;
export const ARG = 2;
export const THIS = 3;
export const THAT = 4;
export const TEMP_BASE = 5; // temp 段 R5–R12
export const STATIC_BASE = 16;
export const STACK_BASE = 256;

/** 预定义汇编符号 */
export function predefinedSymbols(): Map<string, number> {
  const m = new Map<string, number>([
    ["SP", 0],
    ["LCL", 1],
    ["ARG", 2],
    ["THIS", 3],
    ["THAT", 4],
    ["SCREEN", SCREEN_BASE],
    ["KBD", KBD],
  ]);
  for (let i = 0; i < 16; i++) m.set(`R${i}`, i);
  return m;
}

// 浏览器按键 → Hack 键码（规格附录约定 + ASCII 可打印字符原值）
export const KEY_CODES: Record<string, number> = {
  Enter: 128,
  Backspace: 129,
  ArrowLeft: 130,
  ArrowUp: 131,
  ArrowRight: 132,
  ArrowDown: 133,
  Home: 134,
  End: 135,
  PageUp: 136,
  PageDown: 137,
  Insert: 138,
  Delete: 139,
  Escape: 140,
  F1: 141, F2: 142, F3: 143, F4: 144, F5: 145, F6: 146,
  F7: 147, F8: 148, F9: 149, F10: 150, F11: 151, F12: 152,
};

export function hackKeyCode(e: { key: string }): number {
  const mapped = KEY_CODES[e.key];
  if (mapped !== undefined) return mapped;
  if (e.key.length === 1) {
    const c = e.key.charCodeAt(0);
    if (c >= 32 && c <= 126) return c;
  }
  return 0;
}

/** 有符号 16 位截断 */
export function int16(v: number): number {
  return (v << 16) >> 16;
}
