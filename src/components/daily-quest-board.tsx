"use client";

import Link from "next/link";
import { Check, Gift, ScrollText, Target, TimerReset } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { celebrate } from "@/lib/celebrate";
import { claimDailyQuest } from "@/lib/game/quest-actions";
import type { DailyQuestView } from "@/lib/game/quests";

const ICON = {
  encounter: Target,
  focus: TimerReset,
  checkpoint: ScrollText,
} as const;

export function DailyQuestBoard({
  quests,
  compact = false,
}: {
  quests: DailyQuestView[];
  compact?: boolean;
}) {
  const [claimed, setClaimed] = useState(() => new Set(quests.filter((q) => q.claimed).map((q) => q.id)));
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
        title: "委托结算",
        subtitle: `获得 +${result.gained ?? 0} XP`,
      });
      router.refresh();
    });
  };

  return (
    <div className={compact ? "daily-quests compact" : "daily-quests"}>
      {quests.map((quest) => {
        const Icon = ICON[quest.kind];
        const isClaimed = claimed.has(quest.id);
        return (
          <article key={quest.id} className={`daily-quest ${quest.complete ? "complete" : ""}`}>
            <span className="daily-quest-icon">
              {isClaimed ? <Check aria-hidden size={16} /> : <Icon aria-hidden size={16} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h3>{quest.title}</h3>
                <span className="quest-reward">+{quest.rewardXp} XP</span>
              </div>
              {!compact && <p>{quest.description}</p>}
              <div className="mt-2 flex items-center gap-2">
                <div className="progress-track flex-1">
                  <div
                    className={`progress-fill ${quest.complete ? "gold" : "hp"}`}
                    style={{ width: `${Math.min(100, (quest.progress / quest.target) * 100)}%` }}
                  />
                </div>
                <span className="quest-count">{quest.progress}/{quest.target}</span>
              </div>
              {!compact && (
                <Link href={`/courses/${quest.courseId}`} className="quest-course">
                  {quest.courseTitle} · 第 {quest.episodeN} 集
                </Link>
              )}
            </div>
            {quest.complete && !isClaimed && (
              <button
                onClick={() => claim(quest)}
                disabled={pending}
                className="quest-claim"
                title="领取委托奖励"
              >
                <Gift aria-hidden size={16} />
              </button>
            )}
          </article>
        );
      })}
      {error && <p className="mt-2 text-xs text-hp">{error}</p>}
    </div>
  );
}
