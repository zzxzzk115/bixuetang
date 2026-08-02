"use client";

import type { HackDemo } from "@/lib/hack/demos";

export type Speed = "slow" | "normal" | "turbo";

export const SPEED_LABEL: Record<Speed, string> = {
  slow: "慢速",
  normal: "正常",
  turbo: "极速",
};

export function HackControls({
  running,
  canRun,
  speed,
  demos,
  onRun,
  onPause,
  onStep,
  onReset,
  onSpeed,
  onLoadDemo,
}: {
  running: boolean;
  canRun: boolean;
  speed: Speed;
  demos: HackDemo[];
  onRun: () => void;
  onPause: () => void;
  onStep: () => void;
  onReset: () => void;
  onSpeed: (s: Speed) => void;
  onLoadDemo: (id: string) => void;
}) {
  const btn =
    "rounded border px-3 py-1.5 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {running ? (
        <button
          onClick={onPause}
          className={`${btn} border-gold bg-amber-100 text-gold dark:bg-amber-950`}
        >
          ⏸ 暂停
        </button>
      ) : (
        <button
          onClick={onRun}
          disabled={!canRun}
          className={`${btn} border-gold text-gold hover:bg-gold hover:text-background`}
        >
          ▶ 运行
        </button>
      )}
      <button
        onClick={onStep}
        disabled={!canRun || running}
        className={`${btn} border-edge text-muted hover:border-gold hover:text-gold`}
      >
        ⏭ 单步
      </button>
      <button
        onClick={onReset}
        disabled={!canRun}
        className={`${btn} border-edge text-muted hover:border-gold hover:text-gold`}
      >
        ↺ 重置
      </button>
      <select
        value={speed}
        onChange={(e) => onSpeed(e.target.value as Speed)}
        className="rounded border border-edge bg-panel px-2 py-1.5 text-sm outline-none"
      >
        {(Object.keys(SPEED_LABEL) as Speed[]).map((s) => (
          <option key={s} value={s}>
            {SPEED_LABEL[s]}
          </option>
        ))}
      </select>
      <select
        value=""
        onChange={(e) => e.target.value && onLoadDemo(e.target.value)}
        className="ml-auto rounded border border-edge bg-panel px-2 py-1.5 text-sm outline-none"
      >
        <option value="">📦 载入 demo…</option>
        {demos.map((d) => (
          <option key={d.id} value={d.id}>
            {d.title}
          </option>
        ))}
      </select>
    </div>
  );
}
