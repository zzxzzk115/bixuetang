"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Leaf, Palmtree } from "lucide-react";
import {
  cancelVacation,
  setCalmMode,
  setVacation,
  type Wellbeing,
} from "@/lib/game/wellbeing-actions";

// 静心模式开关 + 请假控制。都乐观更新 + router.refresh 拉最新。

function daysUntil(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d) - 8 * 3600 * 1000; // 北京当天 00:00
  return Math.max(0, Math.ceil((target + 86400000 - Date.now()) / 86400000));
}

export function WellbeingControls({ initial }: { initial: Wellbeing }) {
  const router = useRouter();
  const [calm, setCalm] = useState(initial.calmMode);
  const [pending, start] = useTransition();
  const onVacation = !!initial.vacationUntil && daysUntil(initial.vacationUntil) > 0;

  const toggleCalm = () => {
    const next = !calm;
    setCalm(next);
    start(async () => {
      await setCalmMode(next);
      router.refresh();
    });
  };

  const requestLeave = (days: number) => {
    start(async () => {
      await setVacation(days);
      router.refresh();
    });
  };

  const endLeave = () => {
    start(async () => {
      await cancelVacation();
      router.refresh();
    });
  };

  return (
    <div className="wellbeing">
      <label className="wellbeing-row">
        <span className="wellbeing-icon" style={{ background: "var(--app-green)" }}>
          <Leaf size={18} aria-hidden />
        </span>
        <span className="wellbeing-body">
          <b>静心模式</b>
          <small>隐藏段位、幽灵对战、排行榜，只留看视频 · 记笔记 · 复习。不爱竞争就开它。</small>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={calm}
          className={`wellbeing-switch${calm ? " on" : ""}`}
          onClick={toggleCalm}
          disabled={pending}
        >
          <i />
        </button>
      </label>

      <div className="wellbeing-row">
        <span className="wellbeing-icon" style={{ background: "var(--app-teal)" }}>
          <Palmtree size={18} aria-hidden />
        </span>
        <span className="wellbeing-body">
          <b>请假 / 休息</b>
          {onVacation ? (
            <small>
              休假中 · 还剩 {daysUntil(initial.vacationUntil!)} 天，这期间缺勤连胜不会断。
            </small>
          ) : (
            <small>要出差/考试/生病？请个假，连胜不因缺勤中断。</small>
          )}
        </span>
      </div>
      <div className="wellbeing-leave">
        {onVacation ? (
          <button type="button" className="app-btn-plain" onClick={endLeave} disabled={pending}>
            结束休假
          </button>
        ) : (
          [3, 7, 14].map((d) => (
            <button
              key={d}
              type="button"
              className="wellbeing-leave-btn"
              onClick={() => requestLeave(d)}
              disabled={pending}
            >
              请假 {d} 天
            </button>
          ))
        )}
      </div>
    </div>
  );
}
