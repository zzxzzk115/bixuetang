// 构建管线：编辑器文件集 → ROM + trap 表 + 中间产物。
// asm 直接汇编；vm/jack 经翻译后与原生 OS stub 一起汇编，
// OS 调用地址注册进 trap 表（见 os/native.ts 的设计说明）。

import { assemble, type AsmError } from "./asm/assembler";
import type { TrapTable } from "./cpu/machine";
import { NATIVE_OS } from "./os/native";
import { parseVm } from "./vm/parser";
import { translate, type VmUnit } from "./vm/translator";

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

function buildAsm(file: BuildFile): BuildResult {
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

/** VmUnit 集 → ROM + traps（vm 与 jack 共用的后半程） */
export function linkUnits(
  units: VmUnit[],
  stages: { vm?: string },
): BuildResult {
  const defined = new Set(
    units.flatMap((u) => u.commands)
      .filter((c) => c.kind === "function")
      .map((c) => (c as { name: string }).name),
  );

  const entry = defined.has("Sys.init")
    ? "Sys.init"
    : defined.has("Main.main")
      ? "Main.main"
      : null;
  if (!entry) {
    return {
      ok: false,
      errors: [{ file: "", line: 0, message: "缺少入口：请定义 Main.main（或 Sys.init）" }],
    };
  }

  const t = translate(units, { bootstrap: entry });

  // 未定义的调用目标：原生 OS 出 stub，否则报错
  const stubs: string[] = [];
  const nativeUsed: string[] = [];
  const errors: BuildError[] = [];
  for (const target of t.callTargets) {
    if (defined.has(target)) continue;
    if (NATIVE_OS[target]) {
      nativeUsed.push(target);
      stubs.push(`(${target})`, "0"); // 占位指令，pc 落此即触发 trap
    } else {
      errors.push({ file: "", line: 0, message: `未定义的函数: ${target}` });
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  const asm = t.asm + "\n// --- native OS stubs ---\n" + stubs.join("\n");
  const r = assemble(asm);
  if (!r.ok) {
    // 翻译器产出的 asm 出错属于内部 bug，带上下文抛出便于排查
    return {
      ok: false,
      errors: r.errors.map((e) => ({
        file: "<generated.asm>",
        line: e.line,
        message: `内部错误: ${e.message}`,
      })),
    };
  }

  const traps: TrapTable = new Map();
  for (const name of nativeUsed) {
    const addr = r.symbols.get(name);
    if (addr !== undefined) traps.set(addr, NATIVE_OS[name].handler);
  }

  return {
    ok: true,
    rom: r.code,
    traps,
    sourceMap: null,
    stages: { ...stages, asm },
  };
}

function buildVm(files: BuildFile[]): BuildResult {
  const units: VmUnit[] = [];
  const errors: BuildError[] = [];
  for (const f of files.filter((f) => f.name.endsWith(".vm"))) {
    const parsed = parseVm(f.source);
    if (!parsed.ok) {
      errors.push(
        ...parsed.errors.map((e) => ({ file: f.name, line: e.line, message: e.message })),
      );
    } else {
      units.push({ name: f.name.replace(/\.vm$/, ""), commands: parsed.commands });
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  const vmText = files
    .filter((f) => f.name.endsWith(".vm"))
    .map((f) => `// ${f.name}\n${f.source}`)
    .join("\n");
  return linkUnits(units, { vm: vmText });
}

export function build(files: BuildFile[]): BuildResult {
  const kind = detectKind(files);
  if (kind === "asm") {
    const file = files.find((f) => f.name.endsWith(".asm")) ?? files[0];
    return buildAsm(file);
  }
  if (kind === "vm") return buildVm(files);
  return {
    ok: false,
    errors: [{ file: files[0]?.name ?? "", line: 0, message: "Jack 编译器将在 M7c 开放" }],
  };
}
