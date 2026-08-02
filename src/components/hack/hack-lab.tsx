"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createMachine, run, step, type HackMachine, type TrapTable } from "@/lib/hack/cpu/machine";
import { HACK_DEMOS } from "@/lib/hack/demos";
import { build, detectKind, type BuildError, type BuildFile } from "@/lib/hack/pipeline";
import { HackControls, type Speed } from "./hack-controls";
import { HackEditor, type HackLang } from "./hack-editor";
import { HackRegisters } from "./hack-registers";
import { HackScreen } from "./hack-screen";

const SPEED_BUDGET: Record<Speed, number> = {
  slow: 500,
  normal: 50_000,
  turbo: 5_000_000,
};
const FRAME_MS_CAP = 8;

const DEFAULT_FILES: BuildFile[] = [
  { name: "fill.asm", source: HACK_DEMOS[0].files[0].source },
];

function langOf(name: string): HackLang {
  if (name.endsWith(".jack")) return "jack";
  if (name.endsWith(".vm")) return "vm";
  return "asm";
}

export function HackLab({
  supportedKinds,
  onQuest,
}: {
  supportedKinds: ("asm" | "jack")[];
  /** 成就钩子：成功运行时上报（run-asm / run-jack / own-code） */
  onQuest?: (id: string) => void;
}) {
  const [files, setFiles] = useState<BuildFile[]>(DEFAULT_FILES);
  const [activeFile, setActiveFile] = useState(0);
  const [errors, setErrors] = useState<BuildError[]>([]);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState<Speed>("normal");
  // 渲染快照：机器对象经 state 传给子组件（渲染期不碰 ref），seq 驱动重渲染
  const [view, setView] = useState<{ m: HackMachine | null; seq: number }>({
    m: null,
    seq: 0,
  });
  const [stages, setStages] = useState<{ vm?: string; asm?: string }>({});
  const [stageView, setStageView] = useState<"vm" | "asm" | null>(null);

  const machineRef = useRef<HackMachine | null>(null);
  const trapsRef = useRef<TrapTable>(new Map());
  const romRef = useRef<Uint16Array | null>(null);
  const waitUntilRef = useRef(0);

  const demos = HACK_DEMOS.filter((d) => supportedKinds.includes(d.kind));

  const bump = useCallback(() => {
    setView((v) => ({ m: machineRef.current, seq: v.seq + 1 }));
  }, []);

  const compile = useCallback((): boolean => {
    const result = build(files);
    if (!result.ok) {
      setErrors(result.errors);
      machineRef.current = null;
      bump();
      return false;
    }
    setErrors([]);
    setStages(result.stages);
    romRef.current = result.rom;
    trapsRef.current = result.traps;
    machineRef.current = createMachine(result.rom);
    bump();
    return true;
  }, [files, bump]);

  // 运行主循环。用 setTimeout 而非 rAF：面板隐藏/后台标签页时 rAF 不触发，
  // 模拟器会假死；16ms 定时不依赖页面合成，行为一致。
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const frame = () => {
      if (cancelled) return;
      const m = machineRef.current;
      if (!m || m.halted) {
        setRunning(false);
        bump();
        return;
      }
      const now = performance.now();
      // Sys.wait：把请求的毫秒数换算为真实时间暂停（期间保持渲染与键盘）
      if (m.pendingWaitMs > 0) {
        waitUntilRef.current = now + m.pendingWaitMs;
        m.pendingWaitMs = 0;
      }
      if (now < waitUntilRef.current) {
        bump();
        timer = setTimeout(frame, 16);
        return;
      }
      const budget = SPEED_BUDGET[speed];
      const deadline = now + FRAME_MS_CAP;
      let remaining = budget;
      while (
        remaining > 0 &&
        !m.halted &&
        m.pendingWaitMs === 0 &&
        performance.now() < deadline
      ) {
        const chunk = Math.min(remaining, 10_000);
        run(m, chunk, trapsRef.current);
        remaining -= chunk;
      }
      bump();
      timer = setTimeout(frame, 16);
    };
    timer = setTimeout(frame, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [running, speed, bump]);

  const onRun = () => {
    if (!machineRef.current) {
      if (!compile()) return;
    }
    if (machineRef.current?.halted) {
      machineRef.current = createMachine(romRef.current!);
    }
    setRunning(true);
    // 成就上报
    const kind = detectKind(files);
    onQuest?.(kind === "jack" ? "run-jack" : "run-asm");
    const isDemo = HACK_DEMOS.some(
      (d) =>
        d.files.length === files.length &&
        d.files.every((df, i) => df.source === files[i]?.source),
    );
    if (!isDemo) onQuest?.("own-code");
  };

  const onCompile = () => {
    setRunning(false);
    compile();
  };

  const onStep = () => {
    if (!machineRef.current && !compile()) return;
    const m = machineRef.current;
    if (m) {
      step(m, trapsRef.current);
      bump();
    }
  };

  const onReset = () => {
    setRunning(false);
    if (romRef.current) {
      machineRef.current = createMachine(romRef.current);
      bump();
    }
  };

  const onLoadDemo = (id: string) => {
    const demo = HACK_DEMOS.find((d) => d.id === id);
    if (!demo) return;
    setRunning(false);
    machineRef.current = null;
    romRef.current = null;
    setErrors([]);
    setStages({});
    setFiles(demo.files.map((f) => ({ ...f })));
    setActiveFile(0);
    bump();
  };

  const current = files[activeFile];
  const kind = detectKind(files);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_560px]">
      {/* 左：编辑器 */}
      <div className="flex min-w-0 flex-col rounded-lg border border-edge bg-panel">
        <div className="flex items-center gap-1 border-b border-edge px-2 pt-2">
          {files.map((f, i) => (
            <button
              key={f.name}
              onClick={() => setActiveFile(i)}
              className={`rounded-t px-3 py-1.5 font-mono text-xs ${
                i === activeFile
                  ? "bg-background text-gold"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {f.name}
            </button>
          ))}
          <button
            onClick={onCompile}
            className="mb-1 ml-auto rounded border border-gold px-3 py-1 text-xs text-gold hover:bg-gold hover:text-background"
          >
            🔨 编译 ({kind})
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <HackEditor
            value={current.source}
            language={langOf(current.name)}
            onChange={(v) => {
              setFiles((fs) =>
                fs.map((f, i) => (i === activeFile ? { ...f, source: v } : f)),
              );
              machineRef.current = null; // 源码变了需重新编译
              romRef.current = null;
              bump();
            }}
          />
        </div>
        {errors.length > 0 && (
          <div className="max-h-32 overflow-y-auto border-t border-edge p-2">
            {errors.map((e, i) => (
              <p key={i} className="font-mono text-xs text-hp">
                {e.file}:{e.line} {e.message}
              </p>
            ))}
          </div>
        )}
        {(stages.vm || stages.asm) && (
          <div className="border-t border-edge p-2">
            <div className="flex gap-2 text-xs">
              <span className="text-muted">中间产物:</span>
              {stages.vm && (
                <button
                  onClick={() => setStageView(stageView === "vm" ? null : "vm")}
                  className={stageView === "vm" ? "text-gold" : "text-muted hover:text-gold"}
                >
                  VM 代码
                </button>
              )}
              {stages.asm && (
                <button
                  onClick={() => setStageView(stageView === "asm" ? null : "asm")}
                  className={stageView === "asm" ? "text-gold" : "text-muted hover:text-gold"}
                >
                  汇编代码
                </button>
              )}
            </div>
            {stageView && (
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-background p-2 font-mono text-xs text-muted">
                {stages[stageView]}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* 右：屏幕 + 控制 + 寄存器 */}
      <div className="space-y-4">
        <HackScreen machineRef={machineRef} seq={view.seq} />
        <HackControls
          running={running}
          canRun={true}
          speed={speed}
          demos={demos}
          onRun={onRun}
          onPause={() => setRunning(false)}
          onStep={onStep}
          onReset={onReset}
          onSpeed={setSpeed}
          onLoadDemo={onLoadDemo}
        />
        <div className="rounded-lg border border-edge bg-panel p-3">
          <HackRegisters machine={view.m} />
        </div>
      </div>
    </div>
  );
}
