"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crown, PartyPopper, Sparkles, Swords, Trophy } from "lucide-react";
import {
  CELEBRATE_EVENT,
  type Celebration,
  type CelebrationKind,
} from "@/lib/celebrate";

// 全屏庆祝。
//
// 纸屑用 CSS 粒子而不是 Lottie：这套动效要跟着主题色和学科色走，
// Lottie 的颜色烘在 JSON 里改不动，还要多背一个运行时。
// 三十来个 div 配 transform 动画，GPU 上跑起来没有负担。

const KIND_META: Record<
  CelebrationKind,
  { label: string; icon: typeof Trophy; tone: string }
> = {
  boss: { label: "课程通关", icon: Trophy, tone: "var(--app-gold)" },
  level: { label: "等级提升", icon: Sparkles, tone: "var(--app-blue)" },
  promote: { label: "晋升达成", icon: Crown, tone: "var(--app-purple)" },
  quest: { label: "任务完成", icon: Swords, tone: "var(--app-green)" },
};

const DURATION_MS = 2800;
const CONFETTI = 28;
const COLORS = [
  "var(--app-green)",
  "var(--app-blue)",
  "var(--app-gold)",
  "var(--app-orange)",
  "var(--app-teal)",
  "var(--app-purple)",
];

/** 纸屑的随机参数在挂载时定死一次，重渲染不该让它们瞬移 */
function useConfetti(seedKey: string) {
  return useMemo(
    () =>
      Array.from({ length: CONFETTI }, (_, i) => ({
        left: `${(i * 97) % 100}%`,
        delay: `${(i % 7) * 90}ms`,
        duration: `${1500 + ((i * 137) % 900)}ms`,
        color: COLORS[i % COLORS.length],
        spin: `${((i * 71) % 720) - 360}deg`,
        drift: `${(((i * 53) % 120) - 60) / 1}px`,
        // 混一点长条形，全是方片看着呆
        tall: i % 3 === 0,
      })),
    // seedKey 变化 = 新的一次庆祝，重新洗一批
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seedKey],
  );
}

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

  const key = current ? `${current.kind}:${current.title}` : "";
  const confetti = useConfetti(key);

  if (!current) return null;
  const meta = KIND_META[current.kind] ?? KIND_META.quest;
  const Icon = meta.icon;

  return (
    <div className="celebrate-root" aria-live="polite" key={key}>
      <div className="celebrate-confetti" aria-hidden>
        {confetti.map((c, i) => (
          <i
            key={i}
            className={c.tall ? "tall" : undefined}
            style={
              {
                left: c.left,
                background: c.color,
                animationDelay: c.delay,
                animationDuration: c.duration,
                "--spin": c.spin,
                "--drift": c.drift,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div className="celebrate-card">
        <span className="celebrate-icon" style={{ background: meta.tone }}>
          <Icon size={34} aria-hidden />
          <b className="celebrate-ring" style={{ borderColor: meta.tone }} />
        </span>
        <small>{meta.label}</small>
        <h2>{current.title}</h2>
        {current.subtitle && <p>{current.subtitle}</p>}
        <PartyPopper className="celebrate-corner" size={20} aria-hidden />
      </div>
    </div>
  );
}
