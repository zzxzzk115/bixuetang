"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ClipboardList } from "lucide-react";
import type { DailyQuestView, MonthlyQuestView } from "@/lib/game/quests";
import { DailyQuestBoard } from "@/components/daily-quest-board";

// 地图页右下角的悬浮任务栏。默认折叠成一枚小药丸,不挡地图;点开看三条任务。
// 展开/折叠的选择记在本地,跨页面回来还是你上次的样子(不再每次进地图都弹开)。
// 任务本体也常驻试炼页,这里只是地图上的随手入口。

const PREF_KEY = "bxt.questfab.open";

export function QuestFab({
  quests,
  monthly,
}: {
  quests: DailyQuestView[];
  monthly: MonthlyQuestView;
}) {
  // 默认折叠;挂载后再读本地偏好(避免 SSR/首帧 hydration 不一致)
  const [open, setOpen] = useState(false);
  useEffect(() => {
    // 挂载后同步本地偏好:localStorage 服务端读不到,只能在此补读——
    // 这正是避免 hydration 不一致的标准做法,故豁免 set-state-in-effect。
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(localStorage.getItem(PREF_KEY) === "1");
    } catch {
      /* localStorage 不可用就保持折叠 */
    }
  }, []);
  const toggle = () =>
    setOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem(PREF_KEY, next ? "1" : "0");
      } catch {
        /* 忽略写入失败 */
      }
      return next;
    });
  const claimable = quests.filter((q) => q.complete && !q.claimed).length;
  const doneCount = quests.filter((q) => q.complete).length;
  // 还没搞定的任务(没完成 + 已完成待领)——折叠时用红角标提醒,别让人忘了
  const pending = quests.length - doneCount + claimable;

  return (
    <div className={`quest-fab ${open ? "open" : "closed"}`}>
      <button className="quest-fab-bar" onClick={toggle} aria-expanded={open}>
        <span className="quest-fab-icon">
          <ClipboardList size={18} strokeWidth={2.4} aria-hidden />
          {!open && pending > 0 && (
            <span className="quest-fab-dot" aria-hidden>
              {pending}
            </span>
          )}
        </span>
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
