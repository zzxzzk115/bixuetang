"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CELEBRATE_EVENT, type Celebration, type CelebrationKind } from "@/lib/celebrate";

const KIND_META: Record<CelebrationKind, { code: string; label: string; mark: string }> = {
  boss: { code: "BOSS // DEFEATED", label: "首领讨伐完成", mark: "B" },
  level: { code: "LEVEL // UP", label: "学者等级提升", mark: "L" },
  promote: { code: "CLASS // ASCENDED", label: "职业晋升完成", mark: "C" },
  quest: { code: "QUEST // CLEARED", label: "远征任务完成", mark: "Q" },
};

const DURATION_MS = 2600;

export function CelebrationLayer() {
  const [current, setCurrent] = useState<Celebration | null>(null);
  const queue = useRef<Celebration[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playNext = useCallback(function playNext() {
    const next = queue.current.shift() ?? null;
    setCurrent(next);
    timer.current = next ? setTimeout(playNext, DURATION_MS) : null;
  }, []);

  useEffect(() => {
    const onEvent = (event: Event) => {
      queue.current.push((event as CustomEvent<Celebration>).detail);
      if (!timer.current) playNext();
    };
    window.addEventListener(CELEBRATE_EVENT, onEvent);
    return () => {
      window.removeEventListener(CELEBRATE_EVENT, onEvent);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [playNext]);

  if (!current) return null;
  const meta = KIND_META[current.kind];

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4" aria-live="polite">
      <div key={current.title + current.subtitle} className="celebration-panel animate-celebrate">
        <div className="celebration-mark" aria-hidden="true">{meta.mark}</div>
        <div className="min-w-0">
          <div className="font-mono text-[12px] font-bold tracking-[0.18em] text-gold">{meta.code}</div>
          <div className="mt-1 text-[11px] font-bold text-muted">{meta.label}</div>
          <div className="mt-3 text-2xl font-black text-foreground">{current.title}</div>
          {current.subtitle && <div className="mt-1.5 text-sm text-muted">{current.subtitle}</div>}
        </div>
      </div>
    </div>
  );
}
