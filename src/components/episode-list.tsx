"use client";

import { useRef, useState, useTransition } from "react";
import type { Episode } from "@/lib/content/schema";
import { toggleEpisode, type ToggleResult } from "@/lib/progress/actions";

interface Toast {
  id: number;
  text: string;
  kind: "xp" | "boss" | "level";
}

export function EpisodeList({
  courseId,
  episodes,
  watched,
  loggedIn,
}: {
  courseId: string;
  episodes: Episode[];
  watched: number[];
  loggedIn: boolean;
}) {
  const [watchedSet, setWatchedSet] = useState(() => new Set(watched));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [, startTransition] = useTransition();
  const toastSeq = useRef(0);

  const pushToast = (text: string, kind: Toast["kind"]) => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 1800);
  };

  const onToggle = (n: number) => {
    if (!loggedIn) return;
    const next = !watchedSet.has(n);
    // 乐观更新，失败再回滚
    setWatchedSet((s) => {
      const copy = new Set(s);
      if (next) copy.add(n);
      else copy.delete(n);
      return copy;
    });
    startTransition(async () => {
      const res: ToggleResult = await toggleEpisode(courseId, n, next);
      if (!res.ok) {
        setWatchedSet((s) => {
          const copy = new Set(s);
          if (next) copy.delete(n);
          else copy.add(n);
          return copy;
        });
        pushToast(res.error ?? "操作失败", "xp");
        return;
      }
      if (next && res.gained && res.gained > 0) {
        const episodePart = res.gained - (res.bossBonus ?? 0);
        if (episodePart > 0) pushToast(`+${episodePart} XP`, "xp");
        if (res.bossBonus && res.bossBonus > 0) {
          pushToast(`🏆 副本通关！Boss 奖励 +${res.bossBonus} XP`, "boss");
        }
        if (res.levelUp) pushToast(`🎉 升级！Lv.${res.newLevel}`, "level");
      }
    });
  };

  const done = watchedSet.size;
  const total = episodes.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div className="relative">
      {/* 飘字通知 */}
      <div className="pointer-events-none absolute -top-2 right-0 z-10 flex flex-col items-end gap-1">
        {toasts.map((t) => (
          <span
            key={t.id}
            className={`animate-float-up rounded px-2 py-1 text-sm font-bold ${
              t.kind === "boss"
                ? "bg-amber-950 text-gold"
                : t.kind === "level"
                  ? "bg-purple-950 text-purple-300"
                  : "text-xp"
            }`}
          >
            {t.text}
          </span>
        ))}
      </div>

      {/* 副本血条：击破进度 */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-muted">
          <span>
            讨伐进度 {done} / {total}
          </span>
          <span>{pct}%</span>
        </div>
        <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-edge">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              pct >= 100 ? "bg-gold" : "bg-hp"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {!loggedIn && (
        <p className="mb-2 text-xs text-muted">
          <a href="/login" className="text-gold underline">
            登录
          </a>
          后可勾选集数、赚取经验值
        </p>
      )}

      <ol className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {episodes.map((ep) => {
          const isWatched = watchedSet.has(ep.n);
          return (
            <li key={ep.n}>
              <button
                onClick={() => onToggle(ep.n)}
                disabled={!loggedIn}
                className={`flex w-full items-center gap-2 rounded border px-2.5 py-1.5 text-left text-sm transition-colors ${
                  isWatched
                    ? "border-edge bg-panel text-muted"
                    : "border-edge bg-panel-hover text-foreground hover:border-gold"
                } ${loggedIn ? "cursor-pointer" : "cursor-default"}`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[10px] ${
                    isWatched
                      ? "border-xp bg-xp text-background"
                      : "border-muted"
                  }`}
                >
                  {isWatched ? "✓" : ""}
                </span>
                <span className={isWatched ? "line-through" : ""}>
                  {ep.n}. {ep.title}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
