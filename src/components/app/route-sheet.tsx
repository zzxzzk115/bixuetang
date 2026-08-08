"use client";

import { useMemo } from "react";
import { Lock, X } from "lucide-react";
import type { GameBootstrap } from "@/lib/game/bootstrap-types";
import { PATH_TIER_LABEL, type PathTier } from "@/lib/content/schema";

// 路线选择：多邻国「切换课程」式底部弹层，列出全部冒险路径与进度。

const TIER_ORDER: PathTier[] = ["basic", "intermediate", "advanced"];

// 中高级线的解锁只看它自己首课的前置，不是「整条初级线走完」——
// 文案别写成后者，否则用户会以为要把一整条线刷满
const TIER_HINT: Record<PathTier, string> = {
  basic: "没有任何前置，现在就能开始",
  intermediate: "学完对应的前置课后开启",
  advanced: "需要相当的基础，慢慢来",
};

const SUBJECT_LABEL: Record<string, string> = {
  cs: "计算机",
  math: "数学",
  physics: "物理",
  ai: "AI",
  en: "英语",
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
  // 按初级/中级/高级分组：新人一进来该先看见能走的那几条地基线，
  // 而不是在 21 条里翻哪条没锁
  const groups = useMemo(() => {
    const byId = new Map(bootstrap.courses.map((c) => [c.id, c]));
    const byUnit = new Map(bootstrap.shadowUnits.map((u) => [u.id, u]));
    const rows = bootstrap.paths.map((p) => {
      let watched = 0;
      let total = 0;
      let done = 0;
      if (p.mode === "shadow") {
        // 跟读线按「段」记进度、按「单元」记通关,不是集
        for (const uid of p.courseIds) {
          const u = byUnit.get(uid);
          if (!u) continue;
          watched += u.segDone.filter(Boolean).length;
          total += u.segDone.length;
          if (u.segDone.length > 0 && u.segDone.every(Boolean)) done += 1;
        }
      } else {
        for (const cid of p.courseIds) {
          const c = byId.get(cid);
          if (!c) continue;
          watched += c.watchedCount;
          total += c.episodeCount;
          if (c.status === "done") done += 1;
        }
      }
      return { path: p, watched, total, done };
    });
    return TIER_ORDER.map((tier) => ({
      tier,
      rows: rows.filter((r) => r.path.tier === tier),
    })).filter((g) => g.rows.length > 0);
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
          {groups.map(({ tier, rows }) => (
            <section key={tier} className="app-route-group">
              <h3>
                {PATH_TIER_LABEL[tier]}
                <small>{TIER_HINT[tier]}</small>
              </h3>
              {rows.map(({ path, watched, total, done }) => (
            <button
              key={path.id}
              className={`app-route-card ${path.id === currentId ? "active" : ""} ${
                path.unlocked ? "" : "locked"
              } subject-${path.subject}`}
              onClick={() => path.unlocked && onSelect(path.id)}
              disabled={!path.unlocked}
            >
              <span className="app-route-card-subject">
                {path.unlocked ? (
                  (SUBJECT_LABEL[path.subject] ?? path.subject)
                ) : (
                  <>
                    <Lock size={11} aria-hidden /> 未解锁
                  </>
                )}
              </span>
              <span className="app-route-card-title">{path.title}</span>
              {path.unlocked ? (
                <>
                  <span className="app-route-card-bar">
                    <i
                      style={{
                        width: total
                          ? `${Math.round((watched / total) * 100)}%`
                          : "0%",
                      }}
                    />
                  </span>
                  <small>
                    {path.mode === "shadow"
                      ? `${done}/${path.courseIds.length} 单元 · ${watched}/${total} 跟读片段`
                      : `${done}/${path.courseIds.length} 课通关 · ${watched}/${total} 集`}
                  </small>
                </>
              ) : (
                <small className="app-route-card-lock">
                  {path.missingPrereqs.length > 0
                    ? `先学完「${path.missingPrereqs.map((p) => p.title).join("、")}」`
                    : "完成前置课程后开启"}
                </small>
                  )}
                </button>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
