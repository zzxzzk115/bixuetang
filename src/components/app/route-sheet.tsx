"use client";

import { useMemo } from "react";
import { X } from "lucide-react";
import type { GameBootstrap } from "@/lib/game/bootstrap-types";

// 路线选择：多邻国「切换课程」式底部弹层，列出全部冒险路径与进度。

const SUBJECT_LABEL: Record<string, string> = {
  cs: "计算机",
  math: "数学",
  physics: "物理",
  ai: "AI",
};

export function RouteSheet({
  bootstrap,
  currentId,
  onSelect,
  onClose,
}: {
  bootstrap: GameBootstrap;
  currentId: string;
  onSelect: (pathId: string) => void;
  onClose: () => void;
}) {
  const rows = useMemo(() => {
    const byId = new Map(bootstrap.courses.map((c) => [c.id, c]));
    return bootstrap.paths.map((p) => {
      let watched = 0;
      let total = 0;
      let done = 0;
      for (const cid of p.courseIds) {
        const c = byId.get(cid);
        if (!c) continue;
        watched += c.watchedCount;
        total += c.episodeCount;
        if (c.status === "done") done += 1;
      }
      return { path: p, watched, total, done };
    });
  }, [bootstrap]);

  return (
    <div className="app-sheet-backdrop" onClick={onClose}>
      <div
        className="app-sheet"
        role="dialog"
        aria-label="选择冒险路线"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <b>选择冒险路线</b>
          <button onClick={onClose} aria-label="关闭">
            <X size={20} />
          </button>
        </header>
        <div className="app-sheet-list">
          {rows.map(({ path, watched, total, done }) => (
            <button
              key={path.id}
              className={`app-route-card ${path.id === currentId ? "active" : ""} subject-${path.subject}`}
              onClick={() => onSelect(path.id)}
            >
              <span className="app-route-card-subject">
                {SUBJECT_LABEL[path.subject] ?? path.subject}
              </span>
              <span className="app-route-card-title">{path.title}</span>
              <span className="app-route-card-bar">
                <i
                  style={{
                    width: total ? `${Math.round((watched / total) * 100)}%` : "0%",
                  }}
                />
              </span>
              <small>
                {done}/{path.courseIds.length} 课通关 · {watched}/{total} 集
              </small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
