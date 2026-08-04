"use client";

import { useRef, useState, useTransition } from "react";
import { Check, Lock, Play, Search } from "lucide-react";
import { celebrate } from "@/lib/celebrate";
import { announceRpgLoot } from "@/lib/game/rpg-events";
import type { Episode } from "@/lib/content/schema";
import { toggleEpisode, type ToggleResult } from "@/lib/progress/actions";
import { TermUnlockPopup, type UnlockedTerm } from "./term-unlock-popup";
import { seekTo } from "@/lib/seek";

// 分集清单（多邻国式原生版）：大圆勾 + 粗行 + 进度条 + 线性解锁——
// 看完上一集才解锁下一集，不能跳着看（列表顺序即解锁顺序）。
// 点行=播放该集（滚到播放器），点圆圈=记录/撤销观看。
// 结算逻辑与旧 EpisodeList 相同：乐观更新 + toast + 通关/升级庆祝。

interface Toast {
  id: number;
  text: string;
}

const COLLAPSED_LIMIT = 20;

export function AppEpisodeList({
  courseId,
  episodes,
  watched,
  color,
  xpByEpisode,
  multiplierPct = 100,
}: {
  courseId: string;
  episodes: Episode[];
  watched: number[];
  /** 学科色（CSS 颜色值） */
  color: string;
  /** 每集完成可得 XP（已含药水加成）：集号 → XP */
  xpByEpisode: Record<number, number>;
  /** 生效中的加成倍率（100=无） */
  multiplierPct?: number;
}) {
  const [watchedSet, setWatchedSet] = useState(() => new Set(watched));
  const [playing, setPlaying] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [newTerms, setNewTerms] = useState<UnlockedTerm[]>([]);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [, startTransition] = useTransition();
  const toastSeq = useRef(0);

  const pushToast = (text: string) => {
    const id = ++toastSeq.current;
    setToasts((items) => [...items, { id, text }]);
    setTimeout(
      () => setToasts((items) => items.filter((item) => item.id !== id)),
      1800,
    );
  };

  /** 线性解锁：列表里第一集永远解锁，其余看完前一集才解锁 */
  const isLocked = (index: number) =>
    index > 0 && !watchedSet.has(episodes[index - 1].n);

  const onToggle = (episode: number, index: number) => {
    if (isLocked(index)) {
      pushToast("先看完上一集再解锁这集");
      return;
    }
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
        pushToast(result.error ?? "没记录上，再试一次");
        return;
      }
      // 卷宗解锁弹在最后，别和 XP/掉落的吐司抢注意力
      if (next && result.unlockedTerms?.length) {
        setNewTerms(result.unlockedTerms);
      }
      if (next && result.loot) {
        announceRpgLoot(result.loot);
        pushToast(`+${result.loot.coins} 金币 · ${result.loot.item.title}`);
      }
      if (next && result.gained && result.gained > 0) {
        const episodeXp = result.gained - (result.bossBonus ?? 0);
        if (episodeXp > 0) pushToast(`+${episodeXp} XP`);
        if (result.bossBonus && result.bossBonus > 0) {
          celebrate({
            kind: "boss",
            title: "课程通关！",
            subtitle: `全集完成奖励 +${result.bossBonus} XP`,
          });
        }
        if (result.levelUp) {
          celebrate({
            kind: "level",
            title: `升至 Lv.${result.newLevel}`,
            subtitle: "获得 1 技能点，可前往技能星盘加点",
          });
        }
      }
    });
  };

  const play = (episode: Episode) => {
    setPlaying(episode.n);
    seekTo({ page: episode.n, bvid: episode.bvid });
    document
      .getElementById("course-player")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // 只统计本页呈现的集（分段时 watched 里含整门课的记录，不能直接用 size）
  const done = episodes.filter((e) => watchedSet.has(e.n)).length;
  const total = episodes.length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const nextUp = episodes.find((episode) => !watchedSet.has(episode.n));

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? episodes.filter(
        (e) =>
          e.title.toLowerCase().includes(needle) || String(e.n) === needle,
      )
    : episodes;
  const collapsible = !needle && filtered.length > COLLAPSED_LIMIT;
  const visible =
    collapsible && !expanded ? filtered.slice(0, COLLAPSED_LIMIT) : filtered;

  return (
    <div className="app-eps">
      <div className="app-eps-toasts" aria-live="polite">
        {toasts.map((toast) => (
          <span key={toast.id}>{toast.text}</span>
        ))}
      </div>

      <div className="app-eps-progress">
        <div className="app-eps-bar">
          <i
            style={{
              width: `${percent}%`,
              background: percent >= 100 ? "var(--app-gold)" : color,
            }}
          />
        </div>
        <small>
          {done}/{total} 集 · {percent}%
        </small>
      </div>

      <div className="app-eps-actions">
        {nextUp && (
          <button className="app-btn-primary" onClick={() => play(nextUp)}>
            <Play size={16} aria-hidden /> 继续 · 第 {nextUp.n} 集
          </button>
        )}
        {episodes.length > COLLAPSED_LIMIT && (
          <label className="app-eps-search">
            <Search size={16} aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`搜索 ${episodes.length} 集`}
            />
          </label>
        )}
      </div>

      <ol className="app-eps-list">
        {visible.map((episode) => {
          const index = episodes.indexOf(episode);
          const isWatched = watchedSet.has(episode.n);
          const locked = isLocked(index);
          const isCurrent = !locked && !isWatched;
          const isPlaying = playing === episode.n;
          return (
            <li
              key={episode.n}
              className={`${isPlaying ? "playing" : ""} ${locked ? "locked" : ""}`}
            >
              <button
                className={`app-eps-check ${isWatched ? "on" : ""}`}
                style={
                  isWatched
                    ? { background: color, borderColor: color }
                    : isCurrent
                      ? { borderColor: color }
                      : undefined
                }
                onClick={() => onToggle(episode.n, index)}
                aria-label={
                  locked
                    ? `第 ${episode.n} 集未解锁`
                    : isWatched
                      ? `撤销第 ${episode.n} 集`
                      : `完成第 ${episode.n} 集`
                }
              >
                {isWatched ? (
                  <Check size={18} strokeWidth={3.5} />
                ) : locked ? (
                  <Lock size={15} strokeWidth={2.6} />
                ) : null}
              </button>
              <button
                className="app-eps-row"
                onClick={() =>
                  locked ? pushToast("先看完上一集再解锁这集") : play(episode)
                }
              >
                <span className="app-eps-no">{episode.n}</span>
                <span
                  className={`app-eps-title ${isWatched ? "done" : ""} ${isCurrent ? "current" : ""}`}
                >
                  {episode.title}
                </span>
                {!isWatched && xpByEpisode[episode.n] !== undefined && (
                  <span
                    className={`app-eps-xp ${multiplierPct > 100 ? "boosted" : ""}`}
                    title={
                      multiplierPct > 100
                        ? `含药水加成 ×${multiplierPct / 100}`
                        : "完成可得经验"
                    }
                  >
                    +{xpByEpisode[episode.n]}
                  </span>
                )}
                {!locked && (
                  <Play
                    size={16}
                    aria-hidden
                    className="app-eps-play"
                    fill={isPlaying ? "currentColor" : "none"}
                  />
                )}
              </button>
            </li>
          );
        })}
      </ol>

      {collapsible && (
        <button
          className="app-btn-plain app-eps-more"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "收起" : `展开其余 ${filtered.length - COLLAPSED_LIMIT} 集`}
        </button>
      )}

      <TermUnlockPopup terms={newTerms} onClose={() => setNewTerms([])} />
    </div>
  );
}
