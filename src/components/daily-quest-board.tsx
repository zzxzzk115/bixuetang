"use client";

import Link from "next/link";
import { BookOpenCheck, Check, RotateCcw, Swords } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { celebrate } from "@/lib/celebrate";
import { claimDailyQuest } from "@/lib/game/quest-actions";
import type { DailyQuestView } from "@/lib/game/quests";

// 每日任务板(App 风格卡片,目标梯度:进度条离满越近,行动意愿越强)。
// 三条任务对应现役玩法:看一集 / 完成复习 / 打一场试炼。

const META = {
  watch: { icon: BookOpenCheck, color: "var(--app-green)" },
  review: { icon: RotateCcw, color: "var(--app-blue)" },
  trial: { icon: Swords, color: "var(--app-orange)" },
} as const;

export function DailyQuestBoard({
  quests,
}: {
  quests: DailyQuestView[];
  compact?: boolean;
}) {
  const [claimed, setClaimed] = useState(
    () => new Set(quests.filter((q) => q.claimed).map((q) => q.id)),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

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
    </div>
  );
}
