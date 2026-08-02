// Hack CPU 模拟器：纯状态机，无 I/O 无时钟。
// trap 表用于 M7b+：pc 命中注册地址时交给 TS 原生 OS 实现（读 ARG/写返回/恢复帧）。

import { int16, RAM_SIZE, ROM_SIZE } from "../defs";

export interface HackMachine {
  rom: Uint16Array;
  ram: Int16Array;
  a: number;
  d: number;
  pc: number;
  halted: boolean;
  /** 屏幕区被写过（渲染层读后清零） */
  screenDirty: boolean;
  /** 已执行指令计数（含 trap 记 1） */
  cycles: number;
  /** Sys.wait 请求的等待毫秒数（执行层消费后清零） */
  pendingWaitMs: number;
}

export type TrapHandler = (m: HackMachine) => void;
export type TrapTable = Map<number, TrapHandler>;

export function createMachine(rom: Uint16Array): HackMachine {
  const paddedRom = new Uint16Array(ROM_SIZE);
  paddedRom.set(rom.subarray(0, ROM_SIZE));
  return {
    rom: paddedRom,
    ram: new Int16Array(RAM_SIZE),
    a: 0,
    d: 0,
    pc: 0,
    halted: false,
    screenDirty: true,
    cycles: 0,
    pendingWaitMs: 0,
  };
}

/** 单步执行一条指令（或一次 trap） */
export function step(m: HackMachine, traps?: TrapTable): void {
  if (m.halted) return;

  if (traps) {
    const trap = traps.get(m.pc);
    if (trap) {
      trap(m); // handler 自行完成返回帧恢复并改写 pc
      m.cycles++;
      return;
    }
  }

  const instr = m.rom[m.pc];

  if ((instr & 0x8000) === 0) {
    // A 指令
    m.a = instr;
    m.pc = (m.pc + 1) & 0x7fff;
    m.cycles++;
    return;
  }

  // C 指令
  const comp = (instr >> 6) & 0x7f;
  const dest = (instr >> 3) & 0x7;
  const jump = instr & 0x7;

  const aBit = (comp & 0x40) !== 0;
  const x = m.d;
  const y = aBit ? m.ram[m.a & 0x7fff] : int16(m.a);

  let out: number;
  switch (comp & 0x3f) {
    case 0b101010: out = 0; break;
    case 0b111111: out = 1; break;
    case 0b111010: out = -1; break;
    case 0b001100: out = x; break;
    case 0b110000: out = y; break;
    case 0b001101: out = ~x; break;
    case 0b110001: out = ~y; break;
    case 0b001111: out = -x; break;
    case 0b110011: out = -y; break;
    case 0b011111: out = x + 1; break;
    case 0b110111: out = y + 1; break;
    case 0b001110: out = x - 1; break;
    case 0b110010: out = y - 1; break;
    case 0b000010: out = x + y; break;
    case 0b010011: out = x - y; break;
    case 0b000111: out = y - x; break;
    case 0b000000: out = x & y; break;
    case 0b010101: out = x | y; break;
    default: out = 0;
  }
  out = int16(out);

  if (dest & 0b001) {
    const addr = m.a & 0x7fff;
    m.ram[addr] = out;
    if (addr >= 0x4000 && addr < 0x6000) m.screenDirty = true;
  }
  if (dest & 0b010) m.d = out;
  if (dest & 0b100) m.a = out & 0xffff;

  let jumped = false;
  if (jump !== 0) {
    const jmp =
      ((jump & 0b100) !== 0 && out < 0) ||
      ((jump & 0b010) !== 0 && out === 0) ||
      ((jump & 0b001) !== 0 && out > 0);
    if (jmp) {
      m.pc = m.a & 0x7fff;
      jumped = true;
    }
  }
  if (!jumped) m.pc = (m.pc + 1) & 0x7fff;
  m.cycles++;
}

const SPIN_WINDOW = 64;
/**
 * 纯血模式停机约定：Jack 的 Sys.halt 往 R15 写这个魔数再自旋。
 * 标准 VM 翻译只占用 R13/R14，R15 空闲，因此不会误触发。
 */
export const HALT_MAGIC = 32123;
const HALT_FLAG_ADDR = 15;
/** 每隔多少步检查一次停机标志（逐步检查会拖慢热循环） */
const HALT_CHECK_INTERVAL = 1024;

/**
 * 批量执行。返回实际步数；自动停机检测：
 * 无条件自跳转（@X / 0;JMP 指向自身）视为程序结束。
 */
export function run(
  m: HackMachine,
  maxSteps: number,
  traps?: TrapTable,
): { steps: number } {
  let steps = 0;
  let lastPc = -1;
  let samePcCount = 0;

  while (steps < maxSteps && !m.halted && m.pendingWaitMs === 0) {
    const pcBefore = m.pc;
    step(m, traps);
    steps++;
    if (m.pc === pcBefore) {
      // 汇编常见收尾 (END) @END 0;JMP 是单条自跳，直接判停
      m.halted = true;
      break;
    }
    if (m.pc === lastPc) {
      samePcCount++;
      if (samePcCount > SPIN_WINDOW) {
        m.halted = true;
        break;
      }
    } else {
      samePcCount = 0;
    }
    lastPc = pcBefore;

    // 纯血模式：Jack 的 Sys.halt 写完魔数后自旋，靠这个标志识别程序结束
    if ((steps & (HALT_CHECK_INTERVAL - 1)) === 0 && m.ram[HALT_FLAG_ADDR] === HALT_MAGIC) {
      m.halted = true;
      break;
    }
  }
  if (m.ram[HALT_FLAG_ADDR] === HALT_MAGIC) m.halted = true;
  return { steps };
}
