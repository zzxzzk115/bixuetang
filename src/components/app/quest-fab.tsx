"use client";

import { useState } from "react";
import { ChevronDown, ClipboardList } from "lucide-react";
import type { DailyQuestView, MonthlyQuestView } from "@/lib/game/quests";
import { DailyQuestBoard } from "@/components/daily-quest-board";

// 地图页常驻悬浮任务栏:始终浮在右下(底部 Tab 之上),默认展开露出
// 三条任务;点标题条可折叠成一行,给地图让视野。任务本体也常驻在
// 试炼页,这里是地图上的随手入口——不占地图的垂直排版空间。

export function QuestFab({
  quests,
  monthly,
}: {
  quests: DailyQuestView[];
  monthly: MonthlyQuestView;
}) {
  const [open, setOpen] = useState(true);
  const claimable = quests.filter((q) => q.complete && !q.claimed).length;
  const doneCount = quests.filter((q) => q.complete).length;

  return (
    <div className={`quest-fab ${open ? "open" : "closed"}`}>
      <button
        className="quest-fab-bar"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ClipboardList size={18} strokeWidth={2.4} aria-hidden />
        <b>每日任务</b>
        <span className="quest-fab-count">
          {doneCount}/{quests.length}
        </span>
        {claimable > 0 && (
          <span className="quest-fab-badge">{claimable} 可领</span>
        )}
        <ChevronDown
          className="quest-fab-chev"
          size={18}
          strokeWidth={2.4}
          aria-hidden
        />
      </button>
      {open && (
        <div className="quest-fab-body">
          <DailyQuestBoard quests={quests} monthly={monthly} />
        </div>
      )}
    </div>
  );
}
