"use client";

import Link from "next/link";
import {
  BookOpenCheck,
  CalendarCheck,
  Check,
  RotateCcw,
  Swords,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { celebrate } from "@/lib/celebrate";
import { claimDailyQuest, claimMonthlyQuest } from "@/lib/game/quest-actions";
import type { DailyQuestView, MonthlyQuestView } from "@/lib/game/quests";

// 每日任务板(App 风格卡片,目标梯度:进度条离满越近,行动意愿越强)。
// 三条任务对应现役玩法:看一集 / 完成复习 / 打一场试炼。

const META = {
  watch: { icon: BookOpenCheck, color: "var(--app-green)" },
  review: { icon: RotateCcw, color: "var(--app-blue)" },
  trial: { icon: Swords, color: "var(--app-orange)" },
} as const;

export function DailyQuestBoard({
  quests,
  monthly,
}: {
  quests: DailyQuestView[];
  /** 月度任务(本月累计任务数达标)——传入才显示月度进度条 */
  monthly?: MonthlyQuestView;
  compact?: boolean;
}) {
  const [claimed, setClaimed] = useState(
    () => new Set(quests.filter((q) => q.claimed).map((q) => q.id)),
  );
  const [monthlyClaimed, setMonthlyClaimed] = useState(
    () => monthly?.claimed ?? false,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const claimMonthly = () => {
    if (!monthly) return;
    setError(null);
    startTransition(async () => {
      const r = await claimMonthlyQuest();
      if (!r.ok) {
        setError(r.error ?? "月度奖励领取失败");
        return;
      }
      setMonthlyClaimed(true);
      if (r.reward) {
        celebrate({
          kind: "promote",
          title: "🏆 月度任务达成!",
          subtitle: `+${r.reward.xp} XP · +${r.reward.coins} 金币`,
        });
      }
      router.refresh();
    });
  };

  const claim = (quest: DailyQuestView) => {
    setError(null);
    startTransition(async () => {
      const result = await claimDailyQuest(quest.id);
      if (!result.ok) {
        setError(result.error ?? "奖励领取失败");
        return;
      }
      setClaimed((current) => new Set(current).add(quest.id));
      celebrate({
        kind: "quest",
        title: "任务完成",
        subtitle: `获得 +${result.gained ?? 0} XP`,
      });
      // 领完最后一条 → 全勤奖(在任务奖励弹窗之后再来一发,更有收尾感)
      if (result.perfectDay) {
        setTimeout(() => {
          celebrate({
            kind: "promote",
            title: "🎉 今日全勤!",
            subtitle: `额外 +${result.perfectDay!.xp} XP · +${result.perfectDay!.coins} 金币`,
          });
        }, 900);
      }
      router.refresh();
    });
  };

  return (
    <div className="app-quests">
      {quests.map((quest) => {
        const meta = META[quest.kind];
        const Icon = meta.icon;
        const isClaimed = claimed.has(quest.id);
        const claimable = quest.complete && !isClaimed;
        return (
          <article
            key={quest.id}
            className={`app-quest ${quest.complete ? "complete" : ""}`}
          >
            <span
              className="app-quest-icon"
              style={{ background: meta.color }}
              aria-hidden
            >
              {isClaimed ? <Check size={18} strokeWidth={3} /> : <Icon size={18} />}
            </span>
            <div className="app-quest-body">
              <div className="app-quest-head">
                <b>{quest.title}</b>
                {!claimable && (
                  <em className="app-quest-xp">+{quest.rewardXp} XP</em>
                )}
              </div>
              <Link href={quest.href} className="app-quest-desc">
                {quest.description}
              </Link>
              <div className="app-quest-progress">
                <i
                  style={{
                    width: `${Math.min(100, (quest.progress / quest.target) * 100)}%`,
                    background: quest.complete ? "var(--app-gold)" : meta.color,
                  }}
                  aria-hidden
                />
              </div>
            </div>
            {claimable && (
              <button
                onClick={() => claim(quest)}
                disabled={pending}
                className="app-quest-claim"
              >
                领取 +{quest.rewardXp}
              </button>
            )}
          </article>
        );
      })}
      {error && <p className="app-quest-error">{error}</p>}
      <p className="app-quest-perfect">
        三条全部领取,再得全勤奖 +30 XP · +50 金币
      </p>

      {monthly && (
        <div
          className={`app-quest-month ${monthly.complete ? "complete" : ""}`}
        >
          <span className="app-quest-month-icon" aria-hidden>
            <CalendarCheck size={18} />
          </span>
          <div className="app-quest-month-body">
            <div className="app-quest-month-head">
              <b>月度任务</b>
              <em>
                {Math.min(monthly.progress, monthly.target)}/{monthly.target}
              </em>
            </div>
            <small>
              本月累计完成任务 · 达标得 +{monthly.rewardXp} XP · +
              {monthly.rewardCoins} 金币
            </small>
            <div className="app-quest-progress">
              <i
                style={{
                  width: `${Math.min(100, (monthly.progress / monthly.target) * 100)}%`,
                  background: monthly.complete
                    ? "var(--app-gold)"
                    : "var(--app-purple, #c084fc)",
                }}
                aria-hidden
              />
            </div>
          </div>
          {monthly.complete && !monthlyClaimed && (
            <button
              onClick={claimMonthly}
              disabled={pending}
              className="app-quest-claim"
            >
              领取
            </button>
          )}
          {monthlyClaimed && (
            <span className="app-quest-month-done" aria-hidden>
              <Check size={18} strokeWidth={3} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
