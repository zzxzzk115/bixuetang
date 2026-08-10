"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { setDailyGoal } from "@/lib/game/daily-goal-actions";
import { GOAL_LABEL, GOAL_OPTIONS, type DailyProgress } from "@/lib/game/daily-goal";

// 每日目标进度圆环 + 目标档位选择(多邻国式)。今天挣够 N 点经验就达成。

export function DailyGoalRing({ initial }: { initial: DailyProgress }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { goal, todayXp, pct, met } = initial;
  const R = 30;
  const C = 2 * Math.PI * R;
  const dash = (Math.min(100, pct) / 100) * C;

  const pick = (g: number) =>
    start(async () => {
      await setDailyGoal(g);
      router.refresh();
    });

  return (
    <div className={`dgoal${met ? " met" : ""}`}>
      <div className="dgoal-ring-wrap">
        <svg viewBox="0 0 76 76" className="dgoal-ring" aria-hidden>
          <circle cx="38" cy="38" r={R} className="dgoal-track" />
          <circle
            cx="38"
            cy="38"
            r={R}
            className="dgoal-arc"
            strokeDasharray={`${dash} ${C}`}
            transform="rotate(-90 38 38)"
          />
        </svg>
        <div className="dgoal-center">
          {met ? (
            <Check size={22} className="dgoal-check" aria-hidden />
          ) : (
            <>
              <b>{todayXp}</b>
              <small>/{goal}</small>
            </>
          )}
        </div>
      </div>
      <div className="dgoal-body">
        <b>{met ? "今日目标达成 🎉" : "今日目标"}</b>
        <small>
          {met
            ? `已挣 ${todayXp} XP · 超额也算,继续冲`
            : `还差 ${goal - todayXp} XP · 看一集就够`}
        </small>
        <div className="dgoal-picks">
          {GOAL_OPTIONS.map((g) => (
            <button
              key={g}
              className={`dgoal-pick${g === goal ? " on" : ""}`}
              onClick={() => pick(g)}
              disabled={pending}
            >
              {GOAL_LABEL[g]} {g}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
