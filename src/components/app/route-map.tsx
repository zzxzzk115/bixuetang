"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Brain, Check, Gift, Lock, Play } from "lucide-react";
import type {
  CourseSummaryDto,
  GameBootstrap,
} from "@/lib/game/bootstrap-types";
import { buildLessonTrack, type LessonNode } from "@/lib/game/lesson-track";
import { openChestNode, type ChestResult } from "@/lib/game/quiz-actions";
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
        });
        y += NODE_SPACING;
      });
    }
    // 第一个未完成节点 = 当前节点
    const currentIdx = nodes.findIndex((n) => n.state !== "done");
    if (currentIdx >= 0) nodes[currentIdx].state = "current";
    return { nodes, banners, totalH: y + BOTTOM_PAD };
  }, [bootstrap, path, width]);

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
    if (n.state === "locked") return shake(n.key);
    if (n.node.kind === "video") {
      // 带上分段号：课程页只呈现该节点覆盖的集
      router.push(`/courses/${n.course.id}?seg=${n.node.index}`);
      return;
    }
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
                className={`route-node ${n.state} kind-${n.node.kind} ${shakeKey === n.key ? "shake" : ""}`}
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
                        ? "进行中"
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
                <div className="route-node-caption">
                  <small>{captionFor(n.node, isLastQuiz)}</small>
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
