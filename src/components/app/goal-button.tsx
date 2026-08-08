"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Target, X } from "lucide-react";
import { celebrate } from "@/lib/celebrate";
import { rewardToast } from "@/lib/reward-feedback";
import { clearGoalRoadmap, setGoalRoadmap } from "@/lib/game/goal-actions";

// 「设为我的目标 / 当前目标」按钮。已有别的目标时,切换前先弹「不忘初心」确认——
// 鼓励用户守住初心,真要改再确认;改目标只重排推荐,不动地图闯关面。

export function GoalButton({
  roadmapId,
  roadmapTitle,
  currentGoalId,
  currentGoalTitle,
}: {
  roadmapId: string;
  roadmapTitle: string;
  currentGoalId: string | null;
  currentGoalTitle: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const isCurrent = currentGoalId === roadmapId;

  function apply() {
    startTransition(async () => {
      const r = await setGoalRoadmap(roadmapId);
      if (r.ok) {
        rewardToast({ text: `目标已设为「${roadmapTitle}」`, tone: "coin" });
        celebrate({
          kind: "quest",
          title: "新目标已锁定!",
          subtitle: `成为${roadmapTitle.replace(/^成为/, "")}`,
        });
        setConfirming(false);
        router.refresh();
      }
    });
  }

  function onSetClick() {
    // 已有别的目标 → 先确认「不忘初心」;还没目标 → 直接设
    if (currentGoalId && currentGoalId !== roadmapId) setConfirming(true);
    else apply();
  }

  function clear() {
    startTransition(async () => {
      const r = await clearGoalRoadmap();
      if (r.ok) {
        rewardToast({ text: "已取消目标" });
        router.refresh();
      }
    });
  }

  if (isCurrent) {
    return (
      <div className="goal-actions">
        <span className="goal-current">
          <Target size={15} aria-hidden /> 这是你当前的目标
        </span>
        <button className="goal-clear" onClick={clear} disabled={pending}>
          取消目标
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        className="goal-set-btn"
        onClick={onSetClick}
        disabled={pending}
      >
        <Target size={15} aria-hidden /> 设为我的目标
      </button>

      {confirming && (
        <div
          className="goal-confirm-mask"
          onClick={() => !pending && setConfirming(false)}
        >
          <div className="goal-confirm" onClick={(e) => e.stopPropagation()}>
            <button
              className="goal-confirm-close"
              onClick={() => setConfirming(false)}
              aria-label="关闭"
              disabled={pending}
            >
              <X size={18} aria-hidden />
            </button>
            <h2>不忘初心</h2>
            <p>
              你现在的目标是「<b>{currentGoalTitle}</b>」。学习贵在坚持,频繁换路
              容易半途而废。
            </p>
            <p>
              确认无误再切到「<b>{roadmapTitle}</b>」——换后我们会按新路线重排你的
              「下一步」。
            </p>
            <div className="goal-confirm-actions">
              <button
                className="app-btn-plain"
                onClick={() => setConfirming(false)}
                disabled={pending}
              >
                再想想
              </button>
              <button
                className="app-btn-primary"
                onClick={apply}
                disabled={pending}
              >
                确认切换
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
