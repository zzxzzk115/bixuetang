"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Coins, Gift } from "lucide-react";
import { claimAchievements } from "@/lib/game/achievement-actions";
import { celebrate } from "@/lib/celebrate";
import { rewardToast } from "@/lib/reward-feedback";

// 待领取成就横幅:一键领取所有新解锁等级的金币。

export function AchievementClaim({ count, coins }: { count: number; coins: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const claim = () => {
    start(async () => {
      const r = await claimAchievements();
      if (r.ok && r.coins > 0) {
        rewardToast({ text: `领取 ${r.claimed} 枚成就 · +${r.coins} 金币`, tone: "coin" });
        celebrate({ kind: "quest", title: `+${r.coins} 金币!`, subtitle: `领取了 ${r.claimed} 枚新成就` });
      }
      router.refresh();
    });
  };

  return (
    <button className="ach-claim" onClick={claim} disabled={pending}>
      <span className="ach-claim-icon" aria-hidden>
        <Gift size={20} />
      </span>
      <span className="ach-claim-body">
        <b>{count} 枚新成就待领取</b>
        <small>
          <Coins size={12} aria-hidden /> 共 +{coins} 金币
        </small>
      </span>
      <span className="ach-claim-btn">{pending ? "领取中…" : "一键领取"}</span>
    </button>
  );
}
