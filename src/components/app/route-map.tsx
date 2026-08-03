"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock, Star } from "lucide-react";
import type {
  CourseSummaryDto,
  GameBootstrap,
} from "@/lib/game/bootstrap-types";
import { AppShell } from "./app-shell";
import { RouteSheet } from "./route-sheet";

// 多邻国式路线地图（纯 DOM）：选定冒险路径后，课程按 S 形蜿蜒排成节点，
// 原生纵向滚动。已通关=填色+勾，当前=呼吸光环+START 气泡，之后=灰色锁定。
// 节点坐标由公式给出（不靠测量），SVG 虚线小路连接各节点。

const ROUTE_KEY = "guild-route";
/** 每个节点占用的纵向空间（px） */
const SPACING = 168;
const TOP_PAD = 120;
const BOTTOM_PAD = 140;

const SUBJECT_COLOR: Record<string, string> = {
  cs: "var(--app-blue)",
  math: "var(--app-purple)",
  physics: "var(--app-orange)",
  ai: "var(--app-green)",
};

interface NodeVm {
  course: CourseSummaryDto;
  x: number;
  y: number;
  state: "done" | "current" | "locked";
}

export function RouteMap({ bootstrap }: { bootstrap: GameBootstrap }) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [routeId, setRouteId] = useState(() => {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(ROUTE_KEY);
      if (saved && bootstrap.paths.some((p) => p.id === saved)) return saved;
    }
    return bootstrap.paths[0]?.id ?? "";
  });
  const [shakeId, setShakeId] = useState<string | null>(null);

  // 容器宽度：蜿蜒振幅按它算；rAF 后测量 + 窗口 resize 跟随
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

  const nodes: NodeVm[] = useMemo(() => {
    if (!path || width === 0) return [];
    const byId = new Map(bootstrap.courses.map((c) => [c.id, c]));
    const courses = path.courseIds
      .map((id) => byId.get(id))
      .filter((c): c is CourseSummaryDto => !!c);
    const currentIdx = Math.max(
      0,
      courses.findIndex((c) => c.status !== "done"),
    );
    const amp = Math.min(width * 0.24, 120);
    return courses.map((course, i) => ({
      course,
      x: width / 2 + Math.sin(i * 1.15) * amp,
      y: TOP_PAD + i * SPACING,
      state:
        course.status === "done"
          ? "done"
          : i === currentIdx
            ? "current"
            : "locked",
    }));
  }, [bootstrap.courses, path, width]);

  const totalH =
    nodes.length > 0 ? TOP_PAD + (nodes.length - 1) * SPACING + BOTTOM_PAD : 0;

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

  const onNode = (n: NodeVm) => {
    if (n.state === "locked") {
      // 锁定节点抖一下提示还没解锁
      setShakeId(n.course.id);
      setTimeout(() => setShakeId(null), 400);
      return;
    }
    router.push(`/courses/${n.course.id}`);
  };

  return (
    <AppShell
      bootstrap={bootstrap}
      routeTitle={path?.title ?? "选择路线"}
      onRoutePress={() => setSheetOpen(true)}
    >
      <div className="route-map" ref={scrollRef}>
        <div className="route-map-world" style={{ height: totalH }}>
          {/* 节点之间的虚线小路 */}
          {width > 0 && nodes.length > 1 && (
            <svg
              className="route-map-trail"
              width={width}
              height={totalH}
              aria-hidden
            >
              {nodes.slice(0, -1).map((a, i) => {
                const b = nodes[i + 1];
                const lit = a.state === "done";
                return (
                  <path
                    key={a.course.id}
                    d={`M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${(a.y + b.y) / 2 + 22} ${b.x} ${b.y}`}
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

          {nodes.map((n) => {
            const color = SUBJECT_COLOR[n.course.subject] ?? "var(--app-blue)";
            return (
              <div
                key={n.course.id}
                className={`route-node ${n.state} ${shakeId === n.course.id ? "shake" : ""}`}
                style={{ left: n.x, top: n.y }}
              >
                {n.state === "current" && (
                  <span className="route-node-bubble">开始</span>
                )}
                <button
                  className="route-node-btn"
                  style={
                    n.state === "locked"
                      ? undefined
                      : { background: color, boxShadow: `0 6px 0 color-mix(in srgb, ${color} 70%, #000)` }
                  }
                  onClick={() => onNode(n)}
                  aria-label={`${n.course.title}（${n.state === "done" ? "已通关" : n.state === "current" ? "进行中" : "未解锁"}）`}
                >
                  {n.state === "done" ? (
                    <Check size={30} strokeWidth={3.5} />
                  ) : n.state === "current" ? (
                    <Star size={28} strokeWidth={2.6} fill="currentColor" />
                  ) : (
                    <Lock size={24} strokeWidth={2.6} />
                  )}
                </button>
                <div className="route-node-caption">
                  <b>{n.course.title}</b>
                  <small>
                    {n.course.watchedCount}/{n.course.episodeCount}
                  </small>
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
    </AppShell>
  );
}
