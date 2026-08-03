"use client";

import { useMemo, useState } from "react";
import type { GameBootstrap } from "@/lib/game/bootstrap-types";

// 路线选择：多邻国式「切换课程线」的像素风全屏面板。
// 列出全部冒险路径与各自进度，选中后通知地图场景重启到该路线。

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
    <div className="route-sheet" role="dialog" aria-label="选择冒险路线">
      <header>
        <b>选择冒险路线</b>
        <button onClick={onClose} aria-label="关闭">✕</button>
      </header>
      <div className="route-sheet-list">
        {rows.map(({ path, watched, total, done }) => (
          <button
            key={path.id}
            className={path.id === currentId ? "active" : undefined}
            onClick={() => onSelect(path.id)}
          >
            <span className="route-subject">{SUBJECT_LABEL[path.subject] ?? path.subject}</span>
            <span className="route-name">{path.title}</span>
            <span className="route-progress">
              <i style={{ width: total ? `${Math.round((watched / total) * 100)}%` : "0%" }} />
            </span>
            <small>
              {done}/{path.courseIds.length} 课通关 · {watched}/{total} 集
            </small>
          </button>
        ))}
      </div>
    </div>
  );
}
