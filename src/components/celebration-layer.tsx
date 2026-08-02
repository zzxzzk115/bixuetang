"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CELEBRATE_EVENT,
  type Celebration,
  type CelebrationKind,
} from "@/lib/celebrate";

const KIND_ICON: Record<CelebrationKind, string> = {
  boss: "🏆",
  level: "🎉",
  promote: "⚜️",
  quest: "🏅",
};

const DURATION_MS = 2600;

export function CelebrationLayer() {
  const [current, setCurrent] = useState<Celebration | null>(null);
  // 排队用 ref，出队在定时器回调里做，避免 effect 内同步 setState
  const queue = useRef<Celebration[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 命名函数表达式：定时器递归引用自身
  const playNext = useCallback(function playNext() {
    const next = queue.current.shift() ?? null;
    setCurrent(next);
    timer.current = next ? setTimeout(playNext, DURATION_MS) : null;
  }, []);

  useEffect(() => {
    const onEvent = (e: Event) => {
      queue.current.push((e as CustomEvent<Celebration>).detail);
      if (!timer.current) {
        playNext();
      }
    };
    window.addEventListener(CELEBRATE_EVENT, onEvent);
    return () => {
      window.removeEventListener(CELEBRATE_EVENT, onEvent);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [playNext]);

  if (!current) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
      aria-live="polite"
    >
      <div
        key={current.title + current.subtitle}
        className="animate-celebrate rounded-2xl border-2 border-gold bg-background/95 px-12 py-8 text-center shadow-[0_0_60px_rgba(245,197,66,0.45)]"
      >
        <div className="text-5xl">{KIND_ICON[current.kind]}</div>
        <div className="mt-3 text-2xl font-bold text-gold">{current.title}</div>
        {current.subtitle && (
          <div className="mt-1.5 text-sm text-foreground">
            {current.subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
