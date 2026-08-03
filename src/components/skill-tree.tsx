"use client";

import Link from "next/link";
import { useCallback, useRef, useState, useTransition } from "react";
import { SUBJECT_LABEL } from "@/lib/content/schema";
import { unlockSkill } from "@/lib/game/actions";
import type { SkillState } from "@/lib/game/skills";
import { HUB_R, NODE_H, NODE_W, type TreeLayout } from "@/lib/game/tree-layout";
import { SubjectIcon } from "./badges";

export interface SkillNodeView {
  id: string;
  state: SkillState;
  coursesMet: boolean;
  requiresMet: boolean;
  /** 关联课程（含完成态），供详情面板展示 */
  courses: { id: string; title: string; done: boolean }[];
  requires: { id: string; title: string; lit: boolean }[];
  /** 把这个节点写进晋升条件的职业；required=写在 allOf 里（必需）而非 anyOf（可选之一） */
  jobs: { id: string; title: string; tier: number; required: boolean }[];
}

const STATE_STYLE: Record<SkillState, string> = {
  locked: "border-edge bg-panel opacity-75",
  available: "border-xp bg-panel animate-glow cursor-pointer",
  lit: "border-gold bg-panel-strong cursor-pointer",
};

const ZOOMS = [0.3, 0.45, 0.6, 0.8, 1];

/**
 * 服务端与浏览器算 Math.cos 末位可能差 1 ulp，直接拼进 path 会触发水合警告。
 * 坐标统一保留两位小数。
 */
const r2 = (n: number) => Math.round(n * 100) / 100;

export function SkillTree({
  layout,
  views,
  points,
  loggedIn,
}: {
  layout: TreeLayout;
  views: Record<string, SkillNodeView>;
  points: number;
  loggedIn: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.8);
  const [pending, startTransition] = useTransition();

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(
    null,
  );

  /** 天赋盘比视口大，挂载后把滚动位置摆到中心徽记上 */
  const centerView = useCallback((el: HTMLDivElement | null) => {
    viewportRef.current = el;
    if (!el) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  }, []);

  const recenter = () => {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  };

  // 按住空白处拖动平移——节点卡自己会 stopPropagation，不会误触发
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = viewportRef.current;
    if (!el || e.button !== 0) return;
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      left: el.scrollLeft,
      top: el.scrollTop,
    };
    el.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = viewportRef.current;
    const d = drag.current;
    if (!el || !d) return;
    el.scrollLeft = d.left - (e.clientX - d.x);
    el.scrollTop = d.top - (e.clientY - d.y);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    viewportRef.current?.releasePointerCapture(e.pointerId);
  };

  const pos = new Map(layout.nodes.map((n) => [n.node.id, n]));
  const selected = selectedId ? pos.get(selectedId) : null;
  const selectedView = selectedId ? views[selectedId] : null;

  const onUnlock = (id: string) => {
    setError(null);
    startTransition(async () => {
      const res = await unlockSkill(id);
      if (!res.ok) setError(res.error ?? "点亮失败");
    });
  };

  return (
    <div className="min-w-0 w-full">
      <div className="skill-toolbar flex max-w-full flex-wrap items-center justify-end gap-1.5 border border-edge bg-panel px-2 py-1.5">
        <span className="mr-1 text-xs text-muted">缩放</span>
        {ZOOMS.map((z) => (
          <button
            key={z}
            onClick={() => setZoom(z)}
            className={`border px-2 py-0.5 font-mono text-[12px] transition-colors ${
              zoom === z
                ? "border-gold text-gold"
                : "border-edge text-muted hover:border-gold hover:text-gold"
            }`}
          >
            {Math.round(z * 100)}%
          </button>
        ))}
        <button
          onClick={recenter}
          className="ml-1 border border-edge px-2 py-0.5 font-mono text-[12px] text-muted hover:border-gold hover:text-gold"
        >
          回到中心
        </button>
      </div>
      <div
        ref={centerView}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="skill-viewport h-[72vh] min-h-100 cursor-grab touch-none overflow-auto p-4 active:cursor-grabbing"
      >
        {/* 外层按缩放后的尺寸占位，内层整体 scale——滚动条才对得上 */}
        <div
          className="mx-auto"
          style={{ width: layout.width * zoom, height: layout.height * zoom }}
        >
        <div
          className="relative origin-top-left"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `scale(${zoom})`,
          }}
        >
          {/* 底层：同心圈层 + 连线 */}
          <svg
            className="absolute inset-0"
            width={layout.width}
            height={layout.height}
          >
            {layout.rings.map((r, i) => (
              <circle
                key={i}
                cx={layout.center.x}
                cy={layout.center.y}
                r={r}
                fill="none"
                stroke="var(--edge)"
                strokeWidth="1"
                strokeDasharray="3 7"
                opacity="0.5"
              />
            ))}
            {/* 一级节点从中心徽记引出 */}
            {layout.nodes
              .filter((n) => n.node.requires.length === 0)
              .map((n) => (
                <line
                  key={`hub-${n.node.id}`}
                  x1={r2(layout.center.x + Math.cos(n.angle) * HUB_R)}
                  y1={r2(layout.center.y + Math.sin(n.angle) * HUB_R)}
                  x2={n.x}
                  y2={n.y}
                  stroke={
                    views[n.node.id]?.state === "lit"
                      ? "var(--gold)"
                      : "var(--edge)"
                  }
                  strokeWidth={views[n.node.id]?.state === "lit" ? 2 : 1.5}
                />
              ))}
            {/* 前置依赖连线：沿半径方向的平滑曲线 */}
            {layout.edges.map((e, i) => {
              const from = pos.get(e.from);
              const to = pos.get(e.to);
              if (!from || !to) return null;
              const midR = (from.radius + to.radius) / 2;
              const c1x = r2(layout.center.x + Math.cos(from.angle) * midR);
              const c1y = r2(layout.center.y + Math.sin(from.angle) * midR);
              const c2x = r2(layout.center.x + Math.cos(to.angle) * midR);
              const c2y = r2(layout.center.y + Math.sin(to.angle) * midR);
              const lit = views[e.from]?.state === "lit";
              return (
                <path
                  key={i}
                  d={`M ${from.x} ${from.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${to.x} ${to.y}`}
                  fill="none"
                  stroke={lit ? "var(--gold)" : "var(--edge)"}
                  strokeWidth={lit ? 2 : 1.5}
                />
              );
            })}
          </svg>

          {/* 中心徽记 */}
          <div
            className="skill-hub absolute flex items-center justify-center border-2 border-gold bg-panel text-center"
            style={{
              left: layout.center.x - HUB_R,
              top: layout.center.y - HUB_R,
              width: HUB_R * 2,
              height: HUB_R * 2,
            }}
          >
            <span className="text-xs font-bold text-gold">
              知识
              <br />
              核心
            </span>
          </div>

          {/* 学科扇区标签 */}
          {layout.sectors.map((s) => (
            <div
              key={s.subject}
              className="absolute whitespace-nowrap text-sm font-bold text-muted"
              style={{
                left: s.x,
                top: s.y,
                transform: "translate(-50%, -50%)",
              }}
            >
              <SubjectIcon subject={s.subject} /> {SUBJECT_LABEL[s.subject]}
            </div>
          ))}

          {/* 节点层：坐标是中心点，用 translate 居中 */}
          {layout.nodes.map(({ node, x, y }) => {
            const view = views[node.id];
            const isSelected = selectedId === node.id;
            return (
              <button
                key={node.id}
                // 不让点节点被外层的拖拽平移吞掉
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  setSelectedId(isSelected ? null : node.id);
                  setError(null);
                }}
                className={`skill-node absolute overflow-hidden border px-2 py-1 text-left transition-all hover:z-10 hover:scale-105 ${STATE_STYLE[view.state]} ${
                  isSelected ? "z-10 ring-2 ring-mana" : ""
                }`}
                style={{
                  left: x,
                  top: y,
                  width: NODE_W,
                  height: NODE_H,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <div className="flex items-center gap-1">
                  <span className="text-[11px]">
                    {view.state === "lit"
                      ? "◆"
                      : view.state === "available"
                        ? "✧"
                        : "×"}
                  </span>
                  <span
                    className={`truncate text-[13px] font-bold ${view.state === "lit" ? "text-gold" : ""}`}
                  >
                    {node.title}
                  </span>
                </div>
                <div className="truncate text-[12px] text-muted">
                  T{node.tier} ·{" "}
                  {view.state === "lit"
                    ? "已点亮"
                    : view.state === "available"
                      ? `可点亮 ${node.cost} 点`
                      : !view.requiresMet
                        ? "前置未点亮"
                        : "课程未通关"}
                </div>
              </button>
            );
          })}
        </div>
        </div>
      </div>

      {/* 详情面板 */}
      {selected && selectedView && (
        <div className="hud-panel mt-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-bold">
                {selectedView.state === "lit" ? "◆ " : ""}
                {selected.node.title}
              </h2>
              {selected.node.description && (
                <p className="mt-1 text-sm text-muted">
                  {selected.node.description}
                </p>
              )}
            </div>
            {loggedIn && selectedView.state === "available" && (
              <button
                onClick={() => onUnlock(selected.node.id)}
                disabled={pending || points < selected.node.cost}
                className="command-button disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending
                  ? "点亮中……"
                  : points < selected.node.cost
                    ? `技能点不足（需 ${selected.node.cost}）`
                    : `点亮（消耗 ${selected.node.cost} 技能点）`}
              </button>
            )}
            {selectedView.state === "lit" && (
              <span className="border border-gold bg-background/50 px-3 py-1.5 font-mono text-xs text-gold">
                已点亮
              </span>
            )}
          </div>
          {error && <p className="mt-2 text-sm text-hp">{error}</p>}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {selectedView.requires.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-xs font-bold text-muted">
                  前置技能
                </h3>
                <ul className="space-y-1 text-sm">
                  {selectedView.requires.map((r) => (
                    <li key={r.id}>
                      {r.lit ? "✅" : "⬜"} {r.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <h3 className="mb-1.5 text-xs font-bold text-muted">
                关联课程（{selected.node.rule === "all" ? "需全部通关" : "任一通关即可"}）
              </h3>
              <ul className="space-y-1 text-sm">
                {selectedView.courses.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/courses/${c.id}`}
                      className="hover:text-gold"
                    >
                      {c.done ? "✅" : "⬜"} {c.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {selectedView.jobs.length > 0 && (
            <div className="mt-4 border-t border-edge pt-3">
              <h3 className="mb-1.5 text-xs font-bold text-muted">
                通往的职业
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {selectedView.jobs.map((j) => (
                  <Link
                    key={j.id}
                    href="/jobs"
                    title={j.required ? "该职业的必需技能" : "该职业的可选技能之一"}
                    className={`rounded border px-2 py-0.5 text-xs transition-colors hover:border-gold hover:text-gold ${
                      j.required
                        ? "border-gold/50 text-gold"
                        : "border-edge text-muted"
                    }`}
                  >
                    {"★".repeat(j.tier)} {j.title}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {!selected && (
        <p className="mt-4 text-center text-sm text-muted">
          点击节点查看详情与加点
        </p>
      )}
    </div>
  );
}
