"use client";

import { useRef, useState, useTransition } from "react";
import { celebrate } from "@/lib/celebrate";
import { announceRpgLoot } from "@/lib/game/rpg-events";
import { ENCOUNTER_LABEL, encounterForEpisode } from "@/lib/game/rpg";
import type { Episode } from "@/lib/content/schema";
import { toggleEpisode, type ToggleResult } from "@/lib/progress/actions";
import { seekTo } from "@/lib/seek";

interface Toast { id: number; text: string }

export function EpisodeList({ courseId, episodes, watched, loggedIn }: {
  courseId: string;
  episodes: Episode[];
  watched: number[];
  loggedIn: boolean;
}) {
  const [watchedSet, setWatchedSet] = useState(() => new Set(watched));
  const [playing, setPlaying] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [, startTransition] = useTransition();
  const toastSeq = useRef(0);

  const pushToast = (text: string) => {
    const id = ++toastSeq.current;
    setToasts((items) => [...items, { id, text }]);
    setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 1800);
  };

  const onToggle = (episode: number) => {
    if (!loggedIn) return;
    const next = !watchedSet.has(episode);
    setWatchedSet((current) => {
      const copy = new Set(current);
      if (next) copy.add(episode);
      else copy.delete(episode);
      return copy;
    });
    startTransition(async () => {
      const result: ToggleResult = await toggleEpisode(courseId, episode, next);
      if (!result.ok) {
        setWatchedSet((current) => {
          const copy = new Set(current);
          if (next) copy.delete(episode);
          else copy.add(episode);
          return copy;
        });
        pushToast(result.error ?? "行动未能记录");
        return;
      }
      if (next && result.loot) {
        announceRpgLoot(result.loot);
        pushToast(' +' + result.loot.coins + ' 金币 · ' + result.loot.item.title);
      }
      if (next && result.gained && result.gained > 0) {
        const episodeXp = result.gained - (result.bossBonus ?? 0);
        if (episodeXp > 0) pushToast(`+${episodeXp} XP`);
        if (result.bossBonus && result.bossBonus > 0) {
          celebrate({ kind: "boss", title: "副本通关", subtitle: `首领讨伐奖励 +${result.bossBonus} XP` });
        }
        if (result.levelUp) {
          celebrate({ kind: "level", title: `升至 Lv.${result.newLevel}`, subtitle: "获得 1 技能点，可前往技能星盘加点" });
        }
      }
    });
  };

  const done = watchedSet.size;
  const total = episodes.length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const play = (episode: Episode) => {
    setPlaying(episode.n);
    seekTo({ page: episode.n, bvid: episode.bvid });
    document.getElementById("course-player")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const collapsedLimit = 24;
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? episodes.filter((episode) => episode.title.toLowerCase().includes(needle) || String(episode.n) === needle)
    : episodes;
  const collapsible = !needle && filtered.length > collapsedLimit;
  const visible = collapsible && !expanded ? filtered.slice(0, collapsedLimit) : filtered;
  const nextUp = episodes.find((episode) => !watchedSet.has(episode.n));

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -top-3 right-0 z-10 flex flex-col items-end gap-1">
        {toasts.map((toast) => (
          <span key={toast.id} className="animate-float-up border border-xp bg-background px-2 py-1 font-mono text-xs font-bold text-xp">
            {toast.text}
          </span>
        ))}
      </div>

      <div className="mb-4">
        <div className="mb-1.5 flex justify-between font-mono text-[10px] font-bold text-muted">
          <span>攻略完成度 {done} / {total}</span>
          <span>{percent}%</span>
        </div>
        <div className="progress-track">
          <div className={`progress-fill ${percent >= 100 ? "gold" : "hp"}`} style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {nextUp && <button onClick={() => play(nextUp)} className="command-button secondary">继续遭遇 {String(nextUp.n).padStart(2, "0")}</button>}
        {episodes.length > collapsedLimit && (
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`检索 ${episodes.length} 场遭遇`} className="min-w-44 flex-1 border border-edge bg-background px-3 py-2 text-xs outline-none focus:border-gold" />
        )}
        {!loggedIn && <a href="/login" className="command-button secondary ml-auto">登录后记录战果</a>}
      </div>

      {needle && <p className="mb-2 font-mono text-[10px] text-muted">QUERY RESULT // {filtered.length} ENCOUNTERS</p>}

      <ol className="encounter-list">
        {visible.map((episode) => {
          const isWatched = watchedSet.has(episode.n);
          const isPlaying = playing === episode.n;
          const encounterType = encounterForEpisode(episode.n, episodes.length);
          return (
            <li key={episode.n} className={`encounter-row encounter-${encounterType} ${isPlaying ? "active" : ""} ${isWatched ? "cleared" : ""}`}>
              <button onClick={() => onToggle(episode.n)} disabled={!loggedIn} title={loggedIn ? (isWatched ? "撤销战果" : "记录战果") : "登录后可记录"} className="encounter-check">
                {isWatched ? "✓" : ""}
              </button>
              <button onClick={() => play(episode)} className="min-w-0 flex-1 py-2.5 text-left">
                <span className="encounter-code" data-kind={encounterType}>{ENCOUNTER_LABEL[encounterType]} · {String(episode.n).padStart(2, "0")}</span>
                <span className={`encounter-title ${isWatched ? "line-through" : ""}`}>{episode.title}</span>
              </button>
              <span className="encounter-state">{isPlaying ? "PLAY" : isWatched ? "CLEAR" : "READY"}</span>
            </li>
          );
        })}
      </ol>

      {collapsible && (
        <button onClick={() => setExpanded(!expanded)} className="mt-2 w-full border border-dashed border-edge py-2 font-mono text-[10px] font-bold text-muted hover:border-gold hover:text-gold">
          {expanded ? "收起遭遇清单" : `展开其余 ${filtered.length - collapsedLimit} 场遭遇`}
        </button>
      )}
    </div>
  );
}
