// 构建管线：编辑器文件集 → ROM + trap 表 + 中间产物。
// M7a 支持 asm；M7b 加 vm；M7c 加 jack。UI 只调用 build()。

import { assemble, type AsmError } from "./asm/assembler";
import type { TrapTable } from "./cpu/machine";

export interface BuildFile {
  name: string;
  source: string;
}

export interface BuildError {
  file: string;
  line: number;
  message: string;
}

export interface BuildOk {
  ok: true;
  rom: Uint16Array;
  traps: TrapTable;
  /** romAddr → asm 源行（仅纯 asm 构建时有意义） */
  sourceMap: Int32Array | null;
  /** 中间产物（查看生成代码面板） */
  stages: { vm?: string; asm?: string };
}

export interface BuildFail {
  ok: false;
  errors: BuildError[];
}

export type BuildResult = BuildOk | BuildFail;

export type BuildKind = "asm" | "vm" | "jack";

export function detectKind(files: BuildFile[]): BuildKind {
  if (files.some((f) => f.name.endsWith(".jack"))) return "jack";
  if (files.some((f) => f.name.endsWith(".vm"))) return "vm";
  return "asm";
}

export function build(files: BuildFile[]): BuildResult {
  const kind = detectKind(files);

  if (kind === "asm") {
    const file = files.find((f) => f.name.endsWith(".asm")) ?? files[0];
    const r = assemble(file.source);
    if (!r.ok) {
      return {
        ok: false,
        errors: r.errors.map((e: AsmError) => ({
          file: file.name,
          line: e.line,
          message: e.message,
        })),
      };
    }
    return {
      ok: true,
      rom: r.code,
      traps: new Map(),
      sourceMap: r.sourceMap,
      stages: {},
    };
  }

  return {
    ok: false,
    errors: [
      {
        file: files[0]?.name ?? "",
        line: 0,
        message:
          kind === "vm"
            ? "VM 支持将在 M7b 开放"
            : "Jack 编译器将在 M7c 开放",
      },
    ],
  };
}
