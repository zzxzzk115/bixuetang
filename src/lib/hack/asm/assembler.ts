// Hack 汇编器：两遍扫描（符号表 → 生成），纯函数无 I/O。

import { predefinedSymbols, STATIC_BASE } from "../defs";

export interface AsmError {
  line: number; // 1-based 源行号
  message: string;
}

export interface AssembleOk {
  ok: true;
  code: Uint16Array;
  symbols: Map<string, number>;
  /** romAddr → 源行号（1-based），单步调试高亮用 */
  sourceMap: Int32Array;
}

export interface AssembleFail {
  ok: false;
  errors: AsmError[];
}

export type AssembleResult = AssembleOk | AssembleFail;

const COMP: Record<string, number> = {
  // a=0
  "0": 0b0101010, "1": 0b0111111, "-1": 0b0111010,
  D: 0b0001100, A: 0b0110000, "!D": 0b0001101, "!A": 0b0110001,
  "-D": 0b0001111, "-A": 0b0110011, "D+1": 0b0011111, "A+1": 0b0110111,
  "D-1": 0b0001110, "A-1": 0b0110010, "D+A": 0b0000010, "D-A": 0b0010011,
  "A-D": 0b0000111, "D&A": 0b0000000, "D|A": 0b0010101,
  // a=1（M 替换 A）
  M: 0b1110000, "!M": 0b1110001, "-M": 0b1110011, "M+1": 0b1110111,
  "M-1": 0b1110010, "D+M": 0b1000010, "D-M": 0b1010011, "M-D": 0b1000111,
  "D&M": 0b1000000, "D|M": 0b1010101,
  // 交换律别名（规格只列 D 在前形式，手写时 M+D 很常见）
  "A+D": 0b0000010, "A&D": 0b0000000, "A|D": 0b0010101,
  "M+D": 0b1000010, "M&D": 0b1000000, "M|D": 0b1010101,
};

const DEST: Record<string, number> = {
  "": 0b000, M: 0b001, D: 0b010, MD: 0b011, DM: 0b011,
  A: 0b100, AM: 0b101, MA: 0b101, AD: 0b110, DA: 0b110,
  AMD: 0b111, ADM: 0b111,
};

const JUMP: Record<string, number> = {
  "": 0b000, JGT: 0b001, JEQ: 0b010, JGE: 0b011,
  JLT: 0b100, JNE: 0b101, JLE: 0b110, JMP: 0b111,
};

const SYMBOL_RE = /^[A-Za-z_.$:][A-Za-z0-9_.$:]*$/;

interface Line {
  text: string;
  line: number;
}

function stripLines(source: string): Line[] {
  return source.split(/\r?\n/).map((raw, i) => {
    const noComment = raw.replace(/\/\/.*$/, "");
    return { text: noComment.replace(/\s+/g, ""), line: i + 1 };
  });
}

export function assemble(source: string): AssembleResult {
  const errors: AsmError[] = [];
  const symbols = predefinedSymbols();
  const lines = stripLines(source);

  // 第一遍：登记标签
  let romAddr = 0;
  for (const { text, line } of lines) {
    if (text === "") continue;
    if (text.startsWith("(")) {
      if (!text.endsWith(")")) {
        errors.push({ line, message: "标签缺少右括号" });
        continue;
      }
      const label = text.slice(1, -1);
      if (!SYMBOL_RE.test(label)) {
        errors.push({ line, message: `非法标签名: ${label}` });
      } else if (symbols.has(label)) {
        errors.push({ line, message: `标签重复定义: ${label}` });
      } else {
        symbols.set(label, romAddr);
      }
    } else {
      romAddr++;
    }
  }
  if (romAddr > 32768) {
    errors.push({ line: 0, message: `程序超出 ROM 容量（${romAddr} 条指令）` });
  }

  // 第二遍：生成机器码，变量从 RAM 16 起分配
  const code: number[] = [];
  const sourceMap: number[] = [];
  let nextVar = STATIC_BASE;

  for (const { text, line } of lines) {
    if (text === "" || text.startsWith("(")) continue;

    if (text.startsWith("@")) {
      const sym = text.slice(1);
      let value: number;
      if (/^\d+$/.test(sym)) {
        value = Number(sym);
        if (value > 32767) {
          errors.push({ line, message: `@常量超出范围 (0–32767): ${sym}` });
          value = 0;
        }
      } else if (SYMBOL_RE.test(sym)) {
        let addr = symbols.get(sym);
        if (addr === undefined) {
          addr = nextVar++;
          symbols.set(sym, addr);
        }
        value = addr;
      } else {
        errors.push({ line, message: `非法符号: ${sym}` });
        value = 0;
      }
      code.push(value & 0x7fff);
      sourceMap.push(line);
      continue;
    }

    // C 指令: dest=comp;jump
    let rest = text;
    let dest = "";
    let jump = "";
    const eq = rest.indexOf("=");
    if (eq >= 0) {
      dest = rest.slice(0, eq);
      rest = rest.slice(eq + 1);
    }
    const semi = rest.indexOf(";");
    if (semi >= 0) {
      jump = rest.slice(semi + 1);
      rest = rest.slice(0, semi);
    }
    const d = DEST[dest];
    const c = COMP[rest];
    const j = JUMP[jump];
    if (d === undefined) errors.push({ line, message: `非法 dest: ${dest}` });
    if (c === undefined) errors.push({ line, message: `非法 comp: ${rest}` });
    if (j === undefined) errors.push({ line, message: `非法 jump: ${jump}` });
    code.push((0b111 << 13) | ((c ?? 0) << 6) | ((d ?? 0) << 3) | (j ?? 0));
    sourceMap.push(line);
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    code: Uint16Array.from(code),
    symbols,
    sourceMap: Int32Array.from(sourceMap),
  };
}
