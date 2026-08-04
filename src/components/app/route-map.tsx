"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Brain, Check, Gift, Lock, Play } from "lucide-react";
import type {
  CourseSummaryDto,
  GameBootstrap,
} from "@/lib/game/bootstrap-types";
import { buildLessonTrack, type LessonNode } from "@/lib/game/lesson-track";
import {
  getVideoNodeEpisodes,
  openChestNode,
  type ChestResult,
} from "@/lib/game/quiz-actions";
import { AppShell } from "./app-shell";
import { RouteSheet } from "./route-sheet";

// 多邻国式路线地图（纯 DOM）。一门课不再是一个节点，而是一个「单元」：
// 单元横幅（课程名+进度）下面挂一串小节——看视频（若干集打包）、阶段测验、
// 宝箱。节点线性推进：第一个未完成的是当前节点，之后锁定。

const ROUTE_KEY = "guild-route";
const NODE_SPACING = 132;
const BANNER_SPACING = 140;
const BOTTOM_PAD = 140;

const SUBJECT_COLOR: Record<string, string> = {
  cs: "var(--app-blue)",
  math: "var(--app-purple)",
  physics: "var(--app-orange)",
  ai: "var(--app-green)",
};

type NodeState = "done" | "current" | "locked";

interface MapNode {
  key: string;
  course: CourseSummaryDto;
  node: LessonNode;
  x: number;
  y: number;
  state: NodeState;
  /** 视频节点的分集打卡进度（外圈 N 等分环用） */
  ringDone?: number;
}

/** 进度环单段圆弧路径（角度从 12 点方向顺时针起算） */
function arcPath(r: number, startDeg: number, endDeg: number): string {
  const c = 53; // viewBox 106×106 的圆心
  const rad = (d: number) => ((d - 90) * Math.PI) / 180;
  const x1 = c + r * Math.cos(rad(startDeg));
  const y1 = c + r * Math.sin(rad(startDeg));
  const x2 = c + r * Math.cos(rad(endDeg));
  const y2 = c + r * Math.sin(rad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

/** N 等分进度环：filled 段金色（药水生效时变紫）、未完成段灰 */
function NodeRing({
  total,
  done,
  boosted,
}: {
  total: number;
  done: number;
  boosted?: boolean;
}) {
  const gap = total === 1 ? 4 : 16; // 单段近乎整圆
  const span = 360 / total;
  const fill = boosted ? "var(--app-purple)" : "var(--app-gold)";
  return (
    <svg className="route-node-ring" viewBox="0 0 106 106" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <path
          key={i}
          d={arcPath(48, i * span + gap / 2, (i + 1) * span - gap / 2)}
          fill="none"
          stroke={i < done ? fill : "var(--app-line)"}
          strokeWidth={6}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

interface MapBanner {
  key: string;
  course: CourseSummaryDto;
  y: number;
}

function nodeDone(
  course: CourseSummaryDto,
  node: LessonNode,
  watched: Set<number>,
  quizDone: Set<string>,
  chestDone: Set<string>,
): boolean {
  const ref = `${course.id}:${node.index}`;
  if (node.kind === "quiz") return quizDone.has(ref);
  if (node.kind === "chest") return chestDone.has(ref);
  return node.eps.every((n) => watched.has(n));
}

function captionFor(node: LessonNode, isLastQuiz: boolean): string {
  if (node.kind === "chest") return "宝箱";
  if (node.kind === "quiz") return isLastQuiz ? "总复习" : "阶段测验";
  if (node.eps.length === 1) return `第 ${node.eps[0]} 集`;
  return `第 ${node.eps[0]}–${node.eps[node.eps.length - 1]} 集`;
}

export function RouteMap({ bootstrap }: { bootstrap: GameBootstrap }) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // 渲染期不许 Date.now()：挂载快照判断药水是否生效
  const [mountedAt] = useState(() => Date.now());
  const [width, setWidth] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [routeId, setRouteId] = useState(() => {
    // 注意用 window 守卫：Node 22 起 SSR 里也有全局 localStorage，
    // 但没配存储文件时 getItem 直接抛 TypeError
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem(ROUTE_KEY);
        if (saved && bootstrap.paths.some((p) => p.id === saved)) return saved;
      } catch {
        // 隐私模式读不了就算了
      }
    }
    return bootstrap.paths[0]?.id ?? "";
  });
  const [shakeKey, setShakeKey] = useState<string | null>(null);
  const [chestOpening, setChestOpening] = useState(false);
  const [chestReward, setChestReward] = useState<ChestResult | null>(null);
  // 视频节点气泡：点节点先看这节覆盖哪些集，再进入
  const [pop, setPop] = useState<{
    node: MapNode;
    episodes: { n: number; title: string; watched: boolean }[] | null;
  } | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const path =
    bootstrap.paths.find((p) => p.id === routeId) ?? bootstrap.paths[0];

  const { nodes, banners, totalH } = useMemo(() => {
    if (!path || width === 0)
      return { nodes: [] as MapNode[], banners: [] as MapBanner[], totalH: 0 };
    const byId = new Map(bootstrap.courses.map((c) => [c.id, c]));
    const quizDone = new Set(bootstrap.quizDone);
    const chestDone = new Set(bootstrap.chestDone);
    const amp = Math.min(width * 0.24, 120);

    const nodes: MapNode[] = [];
    const banners: MapBanner[] = [];
    let y = 0;
    for (const courseId of path.courseIds) {
      const course = byId.get(courseId);
      if (!course) continue;
      const track = buildLessonTrack(course.episodeNs, course.hasQuiz);
      const watched = new Set(course.watched);
      y += BANNER_SPACING;
      // 横幅贴上沿放，给首节点的「开始」气泡（含弹跳幅度）留够空隙
      banners.push({ key: `banner:${course.id}`, course, y: y - 124 });
      track.forEach((node, i) => {
        nodes.push({
          key: `${course.id}:${node.kind}:${node.index}`,
          course,
          node,
          x: width / 2 + Math.sin(i * 1.05) * amp,
          y: y + 50,
          state: nodeDone(course, node, watched, quizDone, chestDone)
            ? "done"
            : "locked",
          // current 状态下面统一算（要看全局顺序）
          ringDone:
            node.kind === "video"
              ? node.eps.filter((n) => watched.has(n)).length
              : undefined,
        });
        y += NODE_SPACING;
      });
    }
    // 第一个未完成节点 = 当前节点
    const currentIdx = nodes.findIndex((n) => n.state !== "done");
    if (currentIdx >= 0) nodes[currentIdx].state = "current";
    return { nodes, banners, totalH: y + BOTTOM_PAD };
  }, [bootstrap, path, width]);

  // 吸顶「当前浏览课程」条：滚动时算视口顶落在哪门课的区段里
  const [stickyCourse, setStickyCourse] = useState<CourseSummaryDto | null>(
    null,
  );
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || banners.length === 0) return;
    let raf = 0;
    const update = () => {
      const top = el.scrollTop + 130;
      let cur = banners[0].course;
      for (const b of banners) {
        if (b.y <= top) cur = b.course;
        else break;
      }
      setStickyCourse(cur);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
    };
  }, [banners]);

  const scrollToCurrent = () => {
    const el = scrollRef.current;
    const cur = nodes.find((n) => n.state === "current");
    if (el && cur) {
      el.scrollTo({
        top: Math.max(0, cur.y - el.clientHeight / 2),
        behavior: "smooth",
      });
    }
  };

  // 初次渲染滚到当前节点
  const scrolledOnce = useRef(false);
  useEffect(() => {
    if (scrolledOnce.current || nodes.length === 0) return;
    const cur = nodes.find((n) => n.state === "current") ?? nodes[nodes.length - 1];
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = Math.max(0, cur.y - el.clientHeight / 2);
      scrolledOnce.current = true;
    }
  }, [nodes]);

  const selectRoute = (id: string) => {
    setRouteId(id);
    setSheetOpen(false);
    scrolledOnce.current = false;
    try {
      localStorage.setItem(ROUTE_KEY, id);
    } catch {
      // 隐私模式存不了就算了
    }
  };

  const shake = (key: string) => {
    setShakeKey(key);
    setTimeout(() => setShakeKey(null), 400);
  };

  const onNode = async (n: MapNode) => {
    if (n.node.kind === "video") {
      // 多邻国式：先弹气泡预览这节覆盖的各集标题，再进入。
      // 锁定节点也能看灰色预览，只是没有开始按钮
      if (pop?.node.key === n.key) {
        setPop(null);
        return;
      }
      setPop({ node: n, episodes: null });
      const r = await getVideoNodeEpisodes(n.course.id, n.node.index);
      if (r.ok && r.episodes) {
        setPop((cur) =>
          cur?.node.key === n.key ? { node: n, episodes: r.episodes! } : cur,
        );
      }
      return;
    }
    if (n.state === "locked") return shake(n.key);
    if (n.node.kind === "quiz") {
      router.push(`/play/quiz/${n.course.id}/${n.node.index}`);
      return;
    }
    // 宝箱：已开的不响应，当前的就地领取
    if (n.state === "done" || chestOpening) return;
    setChestOpening(true);
    try {
      const result = await openChestNode(n.course.id, n.node.index);
      if (result.ok) setChestReward(result);
      else shake(n.key);
    } finally {
      setChestOpening(false);
    }
  };

  const closeChest = () => {
    setChestReward(null);
    router.refresh(); // 重新注水：金币入袋、宝箱变已开、当前节点前移
  };

  const lastQuizIndexByCourse = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of nodes) {
      if (n.node.kind === "quiz") m.set(n.course.id, n.node.index);
    }
    return m;
  }, [nodes]);

  return (
    <AppShell
      bootstrap={bootstrap}
      routeTitle={path?.title ?? "选择路线"}
      onRoutePress={() => setSheetOpen(true)}
    >
      <div className="route-map" ref={scrollRef}>
        {stickyCourse && (
          <div className="route-map-sticky">
            <span
              className="route-map-sticky-dot"
              style={{
                background:
                  SUBJECT_COLOR[stickyCourse.subject] ?? "var(--app-blue)",
              }}
              aria-hidden
            />
            <div className="route-map-sticky-body">
              <b>{stickyCourse.title}</b>
              <small>
                {stickyCourse.watchedCount}/{stickyCourse.episodeCount} 集
              </small>
            </div>
            <button onClick={scrollToCurrent}>去当前</button>
          </div>
        )}
        <div className="route-map-world" style={{ height: totalH }}>
          {/* 节点之间的虚线小路（单元横幅处断开） */}
          {width > 0 && nodes.length > 1 && (
            <svg
              className="route-map-trail"
              width={width}
              height={totalH}
              aria-hidden
            >
              {nodes.slice(0, -1).map((a, i) => {
                const b = nodes[i + 1];
                if (a.course.id !== b.course.id) return null;
                const lit = a.state === "done";
                return (
                  <path
                    key={a.key}
                    d={`M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${(a.y + b.y) / 2 + 20} ${b.x} ${b.y}`}
                    fill="none"
                    stroke={lit ? "var(--app-green)" : "var(--app-line)"}
                    strokeWidth={6}
                    strokeLinecap="round"
                    strokeDasharray="1 16"
                  />
                );
              })}
            </svg>
          )}

          {banners.map((b) => {
            const color = SUBJECT_COLOR[b.course.subject] ?? "var(--app-blue)";
            return (
              <div
                key={b.key}
                className="route-banner"
                style={{ top: b.y, background: color }}
              >
                <b>{b.course.title}</b>
                <small>
                  {b.course.watchedCount}/{b.course.episodeCount} 集
                  {b.course.code ? ` · ${b.course.code}` : ""}
                </small>
              </div>
            );
          })}

          {nodes.map((n) => {
            // 经验药水生效中：当前节点罩紫色光效
            const boosted =
              n.state === "current" &&
              bootstrap.boost &&
              bootstrap.boost.expiresAt > mountedAt;
            const color =
              n.node.kind === "chest"
                ? "var(--app-gold)"
                : (SUBJECT_COLOR[n.course.subject] ?? "var(--app-blue)");
            const Icon =
              n.state === "done"
                ? Check
                : n.state === "locked"
                  ? Lock
                  : n.node.kind === "quiz"
                    ? Brain
                    : n.node.kind === "chest"
                      ? Gift
                      : Play;
            const isLastQuiz =
              n.node.kind === "quiz" &&
              lastQuizIndexByCourse.get(n.course.id) === n.node.index;
            return (
              <div
                key={n.key}
                className={`route-node ${n.state} kind-${n.node.kind} ${boosted ? "boosted" : ""} ${shakeKey === n.key ? "shake" : ""}`}
                style={{ left: n.x, top: n.y }}
              >
                {n.state === "current" && (
                  <span className="route-node-bubble">
                    {n.node.kind === "chest"
                      ? "开箱"
                      : n.node.kind === "quiz"
                        ? "挑战"
                        : "开始"}
                  </span>
                )}
                <span className="route-node-btnwrap">
                  {boosted && (
                    <span className="boost-bubbles" aria-hidden>
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                  )}
                  {n.node.kind === "video" && n.state === "current" && (
                    <NodeRing
                      total={n.node.eps.length}
                      done={n.ringDone ?? 0}
                      boosted={!!boosted}
                    />
                  )}
                  <button
                    className="route-node-btn"
                    style={
                      n.state === "locked"
                        ? undefined
                        : {
                            background: color,
                            boxShadow: `0 6px 0 color-mix(in srgb, ${color} 70%, #000)`,
                          }
                    }
                    onClick={() => onNode(n)}
                    aria-label={`${n.course.title} ${captionFor(n.node, isLastQuiz)}（${
                      n.state === "done"
                        ? "已完成"
                        : n.state === "current"
                          ? `进行中 ${n.ringDone ?? 0}/${n.node.eps.length}`
                          : "未解锁"
                    }）`}
                  >
                    <Icon
                      size={n.state === "done" ? 30 : 26}
                      strokeWidth={n.state === "done" ? 3.5 : 2.6}
                      fill={
                        n.state === "current" && n.node.kind === "video"
                          ? "currentColor"
                          : "none"
                      }
                    />
                  </button>
                </span>
                <div className="route-node-caption">
                  <small>{captionFor(n.node, isLastQuiz)}</small>
                </div>
              </div>
            );
          })}

          {/* 视频节点气泡：各集标题 + 打卡状态 + 进入按钮 */}
          {pop && (
            <div
              className={`route-pop ${pop.node.state === "locked" ? "locked" : ""}`}
              style={{
                left: Math.min(Math.max(pop.node.x, 150), Math.max(width - 150, 150)),
                top: pop.node.y + 66,
              }}
            >
              <b>{captionFor(pop.node.node, false)}</b>
              {pop.episodes === null ? (
                <small className="route-pop-loading">加载中…</small>
              ) : (
                <ul>
                  {pop.episodes.map((e) => (
                    <li key={e.n} className={e.watched ? "watched" : undefined}>
                      <i>{e.watched ? "✓" : "○"}</i>
                      <span>{e.title}</span>
                    </li>
                  ))}
                </ul>
              )}
              {pop.node.state === "locked" ? (
                <small className="route-pop-lockhint">
                  完成前面的小节即可解锁
                </small>
              ) : (
                <button
                  className="app-btn-primary"
                  onClick={() =>
                    router.push(
                      `/courses/${pop.node.course.id}?seg=${pop.node.node.index}`,
                    )
                  }
                >
                  {pop.node.state === "done" ? "复习" : "开始学习"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {pop && (
        <div
          className="route-pop-backdrop"
          onClick={() => setPop(null)}
          aria-hidden
        />
      )}

      {sheetOpen && path && (
        <RouteSheet
          bootstrap={bootstrap}
          currentId={path.id}
          onSelect={selectRoute}
          onClose={() => setSheetOpen(false)}
        />
      )}

      {chestReward && (
        <div className="app-sheet-backdrop chest-pop" onClick={closeChest}>
          <div className="chest-card" onClick={(e) => e.stopPropagation()}>
            <span className="chest-card-icon">
              <Gift size={44} strokeWidth={2.2} />
            </span>
            <h2>{chestReward.already ? "宝箱已领过" : "宝箱开启！"}</h2>
            {!chestReward.already && (
              <p>
                <b>+{chestReward.coins}</b> 金币 · <b>+{chestReward.gained}</b> XP
              </p>
            )}
            <button className="app-btn-primary" onClick={closeChest}>
              收下
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
