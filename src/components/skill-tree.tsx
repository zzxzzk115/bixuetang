"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { SUBJECT_LABEL } from "@/lib/content/schema";
import { unlockSkill } from "@/lib/game/actions";
import type { SkillState } from "@/lib/game/skills";
import { NODE_H, NODE_W, type TreeLayout } from "@/lib/game/tree-layout";
import { SUBJECT_ICON } from "./badges";

export interface SkillNodeView {
  id: string;
  state: SkillState;
  coursesMet: boolean;
  requiresMet: boolean;
  /** 关联课程（含完成态），供详情面板展示 */
  courses: { id: string; title: string; done: boolean }[];
  requires: { id: string; title: string; lit: boolean }[];
}

const STATE_STYLE: Record<SkillState, string> = {
  locked: "border-edge bg-panel opacity-55",
  available: "border-gold bg-panel animate-glow cursor-pointer",
  lit: "border-gold bg-amber-950 cursor-pointer",
};

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
  const [pending, startTransition] = useTransition();

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
    <div>
      <div className="overflow-x-auto rounded-lg border border-edge bg-background/60 p-4">
        <div
          className="relative"
          style={{ width: layout.width, height: layout.height }}
        >
          {/* 连线层 */}
          <svg
            className="absolute inset-0"
            width={layout.width}
            height={layout.height}
          >
            {layout.edges.map((e, i) => {
              const from = pos.get(e.from);
              const to = pos.get(e.to);
              if (!from || !to) return null;
              const x1 = from.x + NODE_W / 2;
              const y1 = from.y + NODE_H;
              const x2 = to.x + NODE_W / 2;
              const y2 = to.y;
              const lit = views[e.from]?.state === "lit";
              return (
                <path
                  key={i}
                  d={`M ${x1} ${y1} C ${x1} ${y1 + 44}, ${x2} ${y2 - 44}, ${x2} ${y2}`}
                  fill="none"
                  stroke={lit ? "var(--gold)" : "var(--edge)"}
                  strokeWidth={lit ? 2 : 1.5}
                />
              );
            })}
          </svg>

          {/* 学科列标题 */}
          {layout.columns.map((c) => (
            <div
              key={c.subject}
              className="absolute top-0 text-sm font-bold text-muted"
              style={{ left: c.x, width: c.width }}
            >
              <span className="mr-1">{SUBJECT_ICON[c.subject]}</span>
              {SUBJECT_LABEL[c.subject]}
            </div>
          ))}

          {/* 节点层 */}
          {layout.nodes.map(({ node, x, y }) => {
            const view = views[node.id];
            const isSelected = selectedId === node.id;
            return (
              <button
                key={node.id}
                onClick={() => {
                  setSelectedId(isSelected ? null : node.id);
                  setError(null);
                }}
                className={`absolute rounded-lg border p-2.5 text-left transition-all ${STATE_STYLE[view.state]} ${
                  isSelected ? "ring-2 ring-mana" : ""
                }`}
                style={{ left: x, top: y, width: NODE_W, height: NODE_H }}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`truncate text-sm font-bold ${view.state === "lit" ? "text-gold" : ""}`}
                  >
                    {view.state === "lit"
                      ? "◆"
                      : view.state === "available"
                        ? "✧"
                        : "🔒"}{" "}
                    {node.title}
                  </span>
                  <span className="shrink-0 rounded bg-edge px-1 text-[10px] text-muted">
                    T{node.tier}
                  </span>
                </div>
                <div className="mt-1.5 text-xs text-muted">
                  {view.state === "lit"
                    ? "已点亮"
                    : view.state === "available"
                      ? `可点亮 · 消耗 ${node.cost} 技能点`
                      : !view.requiresMet
                        ? "前置技能未点亮"
                        : "关联课程未通关"}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 详情面板 */}
      {selected && selectedView && (
        <div className="mt-4 rounded-lg border border-edge bg-panel p-5">
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
                className="rounded border border-gold px-4 py-2 text-sm font-bold text-gold transition-colors hover:bg-gold hover:text-background disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending
                  ? "点亮中……"
                  : points < selected.node.cost
                    ? `技能点不足（需 ${selected.node.cost}）`
                    : `点亮（消耗 ${selected.node.cost} 技能点）`}
              </button>
            )}
            {selectedView.state === "lit" && (
              <span className="rounded bg-amber-950 px-3 py-1.5 text-sm text-gold">
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
