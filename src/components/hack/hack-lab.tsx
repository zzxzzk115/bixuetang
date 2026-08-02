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

export function HackLab({ supportedKinds }: { supportedKinds: ("asm" | "jack")[] }) {
  const [files, setFiles] = useState<BuildFile[]>(DEFAULT_FILES);
  const [activeFile, setActiveFile] = useState(0);
  const [errors, setErrors] = useState<BuildError[]>([]);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState<Speed>("normal");
  const [tick, setTick] = useState(0);
  const [stages, setStages] = useState<{ vm?: string; asm?: string }>({});
  const [stageView, setStageView] = useState<"vm" | "asm" | null>(null);

  const machineRef = useRef<HackMachine | null>(null);
  const trapsRef = useRef<TrapTable>(new Map());
  const romRef = useRef<Uint16Array | null>(null);
  const waitUntilRef = useRef(0);

  const demos = HACK_DEMOS.filter((d) => supportedKinds.includes(d.kind));

  const compile = useCallback((): boolean => {
    const result = build(files);
    if (!result.ok) {
      setErrors(result.errors);
      machineRef.current = null;
      setTick((t) => t + 1);
      return false;
    }
    setErrors([]);
    setStages(result.stages);
    romRef.current = result.rom;
    trapsRef.current = result.traps;
    machineRef.current = createMachine(result.rom);
    setTick((t) => t + 1);
    return true;
  }, [files]);

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
        setTick((t) => t + 1);
        return;
      }
      const now = performance.now();
      // Sys.wait：把请求的毫秒数换算为真实时间暂停（期间保持渲染与键盘）
      if (m.pendingWaitMs > 0) {
        waitUntilRef.current = now + m.pendingWaitMs;
        m.pendingWaitMs = 0;
      }
      if (now < waitUntilRef.current) {
        setTick((t) => t + 1);
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
      setTick((t) => t + 1);
      timer = setTimeout(frame, 16);
    };
    timer = setTimeout(frame, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [running, speed]);

  const onRun = () => {
    if (!machineRef.current) {
      if (!compile()) return;
    }
    if (machineRef.current?.halted) {
      machineRef.current = createMachine(romRef.current!);
    }
    setRunning(true);
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
      setTick((t) => t + 1);
    }
  };

  const onReset = () => {
    setRunning(false);
    if (romRef.current) {
      machineRef.current = createMachine(romRef.current);
      setTick((t) => t + 1);
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
        <HackScreen machineRef={machineRef} tick={tick} />
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
          <HackRegisters machineRef={machineRef} tick={tick} />
        </div>
      </div>
    </div>
  );
}
