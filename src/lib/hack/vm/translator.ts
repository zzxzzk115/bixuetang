// VM → Hack 汇编翻译器（标准映射：栈算术 / 段寻址 / call-return 帧）

import type { VmCommand } from "./parser";

export interface VmUnit {
  /** 类名/文件名（static 段命名空间） */
  name: string;
  commands: VmCommand[];
}

export interface TranslateOptions {
  /** 入口函数名（生成 SP=256 → call 入口 → 停机自旋）；纯 VM 片段测试传 null */
  bootstrap: string | null;
}

export interface TranslateResult {
  asm: string;
  /** 所有 call 目标（含 OS 调用），pipeline 据此决定 trap stub */
  callTargets: string[];
  /** 本次编译内定义的函数名 */
  definedFunctions: string[];
}

const SEG_BASE: Record<string, string> = {
  local: "LCL",
  argument: "ARG",
  this: "THIS",
  that: "THAT",
};

export function translate(
  units: VmUnit[],
  opts: TranslateOptions,
): TranslateResult {
  const out: string[] = [];
  const callTargets = new Set<string>();
  const definedFunctions: string[] = [];
  let labelSeq = 0;
  let currentFn = "";

  const emit = (...lines: string[]) => out.push(...lines);
  // 栈顶入 D
  const popD = () => emit("@SP", "AM=M-1", "D=M");
  // D 压栈
  const pushD = () => emit("@SP", "M=M+1", "A=M-1", "M=D");

  const compare = (jump: "JEQ" | "JGT" | "JLT") => {
    const t = `CMP_T_${labelSeq}`;
    const end = `CMP_E_${labelSeq}`;
    labelSeq++;
    popD();
    emit("@SP", "AM=M-1", "D=M-D"); // D = x - y
    emit(`@${t}`, `D;${jump}`, "D=0", `@${end}`, "0;JMP", `(${t})`, "D=-1", `(${end})`);
    pushD();
  };

  const doCall = (name: string, args: number) => {
    callTargets.add(name);
    const ret = `RET_${labelSeq++}`;
    emit(`@${ret}`, "D=A");
    pushD();
    for (const seg of ["LCL", "ARG", "THIS", "THAT"]) {
      emit(`@${seg}`, "D=M");
      pushD();
    }
    emit("@SP", "D=M", `@${5 + args}`, "D=D-A", "@ARG", "M=D");
    emit("@SP", "D=M", "@LCL", "M=D");
    emit(`@${name}`, "0;JMP", `(${ret})`);
  };

  if (opts.bootstrap) {
    emit("// bootstrap", "@256", "D=A", "@SP", "M=D");
    doCall(opts.bootstrap, 0);
    emit("(GUILD_HALT)", "@GUILD_HALT", "0;JMP");
  }

  for (const unit of units) {
    for (const cmd of unit.commands) {
      switch (cmd.kind) {
        case "push": {
          const { segment, index } = cmd;
          if (segment === "constant") {
            if (index > 32767) throw new Error(`constant 超界: ${index}`);
            emit(`@${index}`, "D=A");
          } else if (segment === "static") {
            emit(`@${unit.name}.${index}`, "D=M");
          } else if (segment === "temp") {
            emit(`@${5 + index}`, "D=M");
          } else if (segment === "pointer") {
            emit(`@${3 + index}`, "D=M");
          } else {
            emit(`@${index}`, "D=A", `@${SEG_BASE[segment]}`, "A=M+D", "D=M");
          }
          pushD();
          break;
        }
        case "pop": {
          const { segment, index } = cmd;
          if (segment === "static") {
            popD();
            emit(`@${unit.name}.${index}`, "M=D");
          } else if (segment === "temp") {
            popD();
            emit(`@${5 + index}`, "M=D");
          } else if (segment === "pointer") {
            popD();
            emit(`@${3 + index}`, "M=D");
          } else {
            emit(`@${index}`, "D=A", `@${SEG_BASE[segment]}`, "D=M+D", "@R13", "M=D");
            popD();
            emit("@R13", "A=M", "M=D");
          }
          break;
        }
        case "arith": {
          switch (cmd.op) {
            case "add": popD(); emit("@SP", "A=M-1", "M=M+D"); break;
            case "sub": popD(); emit("@SP", "A=M-1", "M=M-D"); break;
            case "and": popD(); emit("@SP", "A=M-1", "M=M&D"); break;
            case "or": popD(); emit("@SP", "A=M-1", "M=M|D"); break;
            case "neg": emit("@SP", "A=M-1", "M=-M"); break;
            case "not": emit("@SP", "A=M-1", "M=!M"); break;
            case "eq": compare("JEQ"); break;
            case "gt": compare("JGT"); break;
            case "lt": compare("JLT"); break;
          }
          break;
        }
        case "label":
          emit(`(${currentFn}$${cmd.label})`);
          break;
        case "goto":
          emit(`@${currentFn}$${cmd.label}`, "0;JMP");
          break;
        case "if-goto":
          popD();
          emit(`@${currentFn}$${cmd.label}`, "D;JNE");
          break;
        case "function": {
          currentFn = cmd.name;
          definedFunctions.push(cmd.name);
          emit(`(${cmd.name})`);
          for (let i = 0; i < cmd.locals; i++) {
            emit("@SP", "M=M+1", "A=M-1", "M=0");
          }
          break;
        }
        case "call":
          doCall(cmd.name, cmd.args);
          break;
        case "return": {
          // R13=frame, R14=retAddr
          emit("@LCL", "D=M", "@R13", "M=D");
          emit("@5", "A=D-A", "D=M", "@R14", "M=D");
          popD();
          emit("@ARG", "A=M", "M=D");
          emit("@ARG", "D=M+1", "@SP", "M=D");
          for (const [i, seg] of (["THAT", "THIS", "ARG", "LCL"] as const).entries()) {
            emit("@R13", "D=M", `@${i + 1}`, "A=D-A", "D=M", `@${seg}`, "M=D");
          }
          emit("@R14", "A=M", "0;JMP");
          break;
        }
      }
    }
  }

  return {
    asm: out.join("\n"),
    callTargets: [...callTargets],
    definedFunctions,
  };
}
