"use client";

import { useEffect, useRef, useState } from "react";
import type { ComputeEngine } from "@cortex-js/compute-engine";
import type { MathfieldElement } from "mathlive";
import { compilePlot, OP_LABEL, runOp, type MathOp } from "@/lib/math/engine";
import { completeLabTask } from "@/lib/progress/actions";
import { celebrate } from "@/lib/celebrate";
import { StaticMath } from "./static-math";
import { FunctionPlot } from "./function-plot";

interface HistoryEntry {
  input: string;
  op: MathOp;
  output: string;
}

export function MathLab({ initialExpr }: { initialExpr?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mfRef = useRef<MathfieldElement | null>(null);
  const ceRef = useRef<ComputeEngine | null>(null);
  const achievedRef = useRef(new Set<string>());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [plot, setPlot] = useState<{
    sampler: (x: number) => number;
    latex: string;
  } | null>(null);

  // 加载 mathlive + compute-engine（仅本路由，动态 import 不进主包）
  useEffect(() => {
    let disposed = false;
    void (async () => {
      const [{ MathfieldElement }, { ComputeEngine }] = await Promise.all([
        import("mathlive"),
        import("@cortex-js/compute-engine"),
      ]);
      if (disposed || !hostRef.current) return;
      MathfieldElement.fontsDirectory = "/mathlive-fonts";
      MathfieldElement.soundsDirectory = null;
      const mf = new MathfieldElement();
      mf.mathVirtualKeyboardPolicy = "manual";
      mf.value = initialExpr ?? "\\frac{d}{dx}\\left(x^2\\sin(x)\\right)";
      mf.style.width = "100%";
      mf.style.fontSize = "1.25rem";
      mf.style.padding = "8px";
      mf.style.background = "var(--background)";
      mf.style.border = "1px solid var(--edge)";
      mf.style.borderRadius = "6px";
      hostRef.current.innerHTML = "";
      hostRef.current.appendChild(mf);
      mfRef.current = mf;
      ceRef.current = new ComputeEngine();
      setReady(true);
    })();
    return () => {
      disposed = true;
    };
  }, [initialExpr]);

  const earnAchievement = (taskId: string) => {
    if (achievedRef.current.has(taskId)) return;
    achievedRef.current.add(taskId);
    void completeLabTask("math", taskId).then((result) => {
      if ((result.gained ?? 0) > 0) {
        celebrate({
          kind: "quest",
          title: result.taskTitle ?? "设施目标完成",
          subtitle: `实验奖励 +${result.gained} XP`,
        });
      }
    });
  };

  const currentLatex = () => mfRef.current?.value?.trim() ?? "";

  const doOp = (op: MathOp) => {
    const ce = ceRef.current;
    const latex = currentLatex();
    if (!ce || !latex) return;
    setError(null);
    // 「d/dx(...)」形式直接求值更符合直觉：求导按钮对内层表达式操作
    const r = runOp(ce, latex, op);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setHistory((h) => [{ input: latex, op, output: r.latex }, ...h].slice(0, 20));
    earnAchievement(op === "derivative" ? "symbolic-derivative" : "first-evaluation");
  };

  const doPlot = () => {
    const ce = ceRef.current;
    const latex = currentLatex();
    if (!ce || !latex) return;
    setError(null);
    const sampler = compilePlot(ce, latex);
    if (!sampler) {
      setError("无法绘图：表达式需只含变量 x（或本身可求值为 y=f(x)）");
      return;
    }
    setPlot({ sampler, latex });
    earnAchievement("function-plot");
  };

  const btn =
    "rounded border border-edge px-3 py-1.5 text-sm text-muted transition-colors hover:border-gold hover:text-gold disabled:opacity-40";

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
      <div className="space-y-4">
        <div className="rounded-lg border border-edge bg-panel p-4">
          <div ref={hostRef}>
            <p className="py-3 text-center text-sm text-muted">
              演算引擎加载中……
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(OP_LABEL) as MathOp[]).map((op) => (
              <button key={op} onClick={() => doOp(op)} disabled={!ready} className={btn}>
                {OP_LABEL[op]}
              </button>
            ))}
            <button onClick={doPlot} disabled={!ready} className={btn}>
              绘图 y=f(x)
            </button>
            <button
              onClick={() => {
                const mf = mfRef.current;
                if (mf) {
                  mf.executeCommand("toggleVirtualKeyboard");
                }
              }}
              disabled={!ready}
              className={`${btn} ml-auto`}
              title="虚拟键盘"
            >
              ⌨️
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-hp">{error}</p>}
        </div>

        {history.length > 0 && (
          <div className="space-y-2">
            {history.map((h, i) => (
              <div
                key={history.length - i}
                className="rounded-lg border border-edge bg-panel p-3"
              >
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{OP_LABEL[h.op]}</span>
                  <button
                    onClick={() => {
                      if (mfRef.current) mfRef.current.value = h.output;
                    }}
                    className="hover:text-gold"
                  >
                    ↰ 回填结果
                  </button>
                </div>
                <div className="mt-1 grid gap-1 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                  <StaticMath latex={h.input} />
                  <span className="hidden text-center text-gold sm:block">⟹</span>
                  <StaticMath latex={h.output} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        {plot ? (
          <FunctionPlot sampler={plot.sampler} latex={plot.latex} />
        ) : (
          <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-edge text-sm text-muted">
            输入只含 x 的表达式后点「绘图」
          </div>
        )}
        <div className="mt-4 rounded-lg border border-edge bg-panel p-4 text-xs leading-relaxed text-muted">
          <p className="mb-1 font-bold">💡 用法</p>
          <p>
            输入框支持 LaTeX 与自然输入（打 / 自动变分数、^ 上标）。
            「求值」算数值，「化简」做符号整理，「求导」对 x 求 d/dx。
            课程知识点里带 ⚗️ 的公式会自动带到这里。
          </p>
        </div>
      </div>
    </div>
  );
}
