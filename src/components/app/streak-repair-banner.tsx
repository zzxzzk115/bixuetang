"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flame } from "lucide-react";
import { repairStreak } from "@/lib/game/streak-actions";
import { celebrate } from "@/lib/celebrate";
import { rewardToast } from "@/lib/reward-feedback";

// 连胜断了的修复横幅:花金币把连胜补回原来的天数。修复成功即隐藏。
export function StreakRepairBanner({
  lostStreak,
  cost,
}: {
  lostStreak: number;
  cost: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const repair = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const r = await repairStreak();
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "修复失败");
      return;
    }
    setDone(true);
    rewardToast({ text: `连胜恢复到 ${r.restored} 天`, tone: "streak" });
    celebrate({
      kind: "quest",
      title: "连胜续上啦！",
      subtitle: `${r.restored} 天的坚持又接回来了`,
    });
    router.refresh();
  };

  if (done) return null;

  return (
    <section className="streak-repair">
      <span className="streak-repair-icon" aria-hidden>
        <Flame size={22} strokeWidth={2.4} />
      </span>
      <div className="streak-repair-body">
        <b>你的 {lostStreak} 天连胜断了</b>
        <small>
          {err ?? `花 ${cost} 金币补回来,别让这份坚持白费`}
        </small>
      </div>
      <button
        className="app-btn-primary streak-repair-btn"
        onClick={repair}
        disabled={busy}
      >
        {busy ? "修复中…" : "修复连胜"}
      </button>
    </section>
  );
}
