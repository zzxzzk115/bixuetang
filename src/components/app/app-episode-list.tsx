"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Brain, Check, Lock, Play, Search } from "lucide-react";
import type { Episode } from "@/lib/content/schema";
import { celebrate } from "@/lib/celebrate";
import { toggleEpisode, type ToggleResult } from "@/lib/progress/actions";
import { announceSettle } from "@/lib/reward-feedback";
import { TermUnlockPopup, type UnlockedTerm } from "./term-unlock-popup";
import { MiniQuiz } from "./mini-quiz";
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
  segmentsByEpisode = {},
  segmentCoverageByEpisode = {},
  scopedNode = false,
}: {
  courseId: string;
  episodes: Episode[];
  watched: number[];
  /** 是否是地图视频节点的作用域视图(1-4 集):全部看完则庆祝并返回地图 */
  scopedNode?: boolean;
  /** 学科色（CSS 颜色值） */
  color: string;
  /** 每集完成可得 XP（已含药水加成）：集号 → XP */
  xpByEpisode: Record<number, number>;
  /** 生效中的加成倍率（100=无） */
  multiplierPct?: number;
  /** 长视频的分段(碎片化学习):集号 → 段列表 */
  segmentsByEpisode?: Record<
    number,
    { idx: number; title: string; from: number; to: number }[]
  >;
  /** 各段已看覆盖率 ×100:集号 → 数组(与段列表同序) */
  segmentCoverageByEpisode?: Record<number, number[]>;
}) {
  const [watchedSet, setWatchedSet] = useState(() => new Set(watched));
  const [playing, setPlaying] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [newTerms, setNewTerms] = useState<UnlockedTerm[]>([]);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  // 当前展开小测验的集号(null=没展开);自愿点开,不影响通关
  const [quizEp, setQuizEp] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const toastSeq = useRef(0);
  const router = useRouter();
  const returnedRef = useRef(false);
  // 本节完成后询问是否回地图(而非自动跳)
  const [returnPrompt, setReturnPrompt] = useState(false);
  // 挂载时就已全部看完 = 用户是来「重温」的,别庆祝、别把人踢回地图。
  // 只有本次会话里把最后一集看完(从未完成→完成)才庆祝并返回。
  const initiallyDoneRef = useRef(
    !!scopedNode &&
      episodes.length > 0 &&
      episodes.every((e) => watchedSet.has(e.n)),
  );

  // 分集节点(1-4 集)本次会话里全部看完 → 庆祝一下,并「询问」是否回地图,
  // 不再自动跳走:用户可以选择回地图继续,或留下重温。只触发一次。
  // 一进来就已全部看完 = 来重温的,不庆祝也不询问(见 initiallyDoneRef)。
  useEffect(() => {
    if (!scopedNode || returnedRef.current || episodes.length === 0) return;
    if (initiallyDoneRef.current) return;
    const allDone = episodes.every((e) => watchedSet.has(e.n));
    if (!allDone) return;
    returnedRef.current = true;
    celebrate({
      kind: "quest",
      title: "本节全部完成！",
      subtitle: "干得漂亮",
    });
    // 完成一次性触发询问弹窗(returnedRef 保证只跑一次),非派生态,故豁免
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReturnPrompt(true);
  }, [scopedNode, episodes, watchedSet]);

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
      // XP/金币/彩蛋/连胜/升级——统一走全局反馈层
      if (next) announceSettle(result);
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

      {returnPrompt && (
        <div
          className="node-done-mask"
          role="dialog"
          aria-modal="true"
          onClick={() => setReturnPrompt(false)}
        >
          <div className="node-done-card" onClick={(e) => e.stopPropagation()}>
            <b className="node-done-title">🎉 本节全部完成！</b>
            <p className="node-done-sub">回地图继续闯关,还是留下再看看?</p>
            <div className="node-done-actions">
              <button
                type="button"
                className="app-btn-primary"
                onClick={() => router.push("/play")}
              >
                回地图继续
              </button>
              <button
                type="button"
                className="app-btn-plain"
                onClick={() => setReturnPrompt(false)}
              >
                留下再看看
              </button>
            </div>
          </div>
        </div>
      )}

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
              {/* 长视频的分段 chips:每段一个可完成的小目标,
                  通勤路上也能啃一段(碎片化学习)。
                  已完成的集也保留(全金 100%)——老玩家不该看到 0% */}
              {!locked &&
                (segmentsByEpisode[episode.n]?.length ?? 0) > 1 && (
                  <div className="app-eps-segs">
                    {segmentsByEpisode[episode.n]!.map((seg) => {
                      const pct = isWatched
                        ? 100
                        : (segmentCoverageByEpisode[episode.n]?.[seg.idx] ?? 0);
                      const segDone = pct >= 90;
                      return (
                        <button
                          key={seg.idx}
                          className={`app-eps-seg ${segDone ? "done" : ""}`}
                          title={`${seg.title} · 已看 ${pct}%`}
                          onClick={() => {
                            setPlaying(episode.n);
                            seekTo({
                              page: episode.n,
                              seconds: seg.from,
                              bvid: episode.bvid,
                            });
                            document
                              .getElementById("course-player")
                              ?.scrollIntoView({
                                behavior: "smooth",
                                block: "center",
                              });
                          }}
                        >
                          <i
                            className="app-eps-seg-fill"
                            style={{
                              width: `${pct}%`,
                              background: segDone ? "var(--app-gold)" : color,
                            }}
                            aria-hidden
                          />
                          <span>{seg.title}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              {/* 看完这集后可自愿做的小测验:巩固 + 一小笔 XP。
                  不在通关路径上,纯粹给主动复习的人的额外奖励。 */}
              {isWatched &&
                (quizEp === episode.n ? (
                  <MiniQuiz
                    courseId={courseId}
                    epN={episode.n}
                    color={color}
                    onClose={() => setQuizEp(null)}
                  />
                ) : (
                  <button
                    className="app-eps-quiz-btn"
                    onClick={() => setQuizEp(episode.n)}
                  >
                    <Brain size={15} aria-hidden /> 小测验 · 巩固得 XP
                  </button>
                ))}
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
