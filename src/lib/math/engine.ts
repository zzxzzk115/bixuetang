// 数学工坊薄封装：ce 实例由调用方传入（浏览器动态 import / node 单测直接 new），
// 本模块保持纯函数、无浏览器依赖。

import type { ComputeEngine } from "@cortex-js/compute-engine";

export type MathOp = "evaluate" | "simplify" | "derivative";

export const OP_LABEL: Record<MathOp, string> = {
  evaluate: "求值",
  simplify: "化简",
  derivative: "对 x 求导",
};

export type MathResult =
  | { ok: true; latex: string }
  | { ok: false; error: string };

export function runOp(
  ce: ComputeEngine,
  latex: string,
  op: MathOp,
): MathResult {
  try {
    const expr = ce.parse(latex);
    if (!expr.isValid) {
      return { ok: false, error: "表达式无法解析，请检查语法" };
    }
    let result;
    switch (op) {
      case "evaluate":
        result = expr.N();
        break;
      case "simplify":
        result = expr.simplify();
        break;
      case "derivative":
        result = ce.box(["D", expr, "x"]).evaluate();
        break;
    }
    return { ok: true, latex: result.latex };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "计算失败" };
  }
}

/**
 * 得到 x→y 数值采样函数；含 x 以外自由变量或表达式非法时返回 null。
 * 本版 compute-engine 无 compile()，用 subs+N 逐点求值（实测 257 点 ≈ 35ms，够用）。
 */
export function compilePlot(
  ce: ComputeEngine,
  latex: string,
): ((x: number) => number) | null {
  try {
    const expr = ce.parse(latex);
    if (!expr.isValid) return null;
    const frees = expr.unknowns.filter((s) => s !== "x");
    if (frees.length > 0) return null;
    return (x: number) => {
      try {
        const v = expr.subs({ x }).N().re;
        return typeof v === "number" ? v : NaN;
      } catch {
        return NaN;
      }
    };
  } catch {
    return null;
  }
}
