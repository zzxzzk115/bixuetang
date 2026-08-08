"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Target } from "lucide-react";
import type { GameBootstrap } from "@/lib/game/bootstrap-types";
import type { RoadmapChoice } from "@/lib/game/roadmap-choices";
import { dismissGoalPrompt, setGoalRoadmap } from "@/lib/game/goal-actions";
import { celebrate } from "@/lib/celebrate";
import { rewardToast } from "@/lib/reward-feedback";
import { CareerGlyph, ROADMAP_TONE } from "./career-glyph";
import { CareerOther } from "./career-other";

// 老用户补弹:引导上线前就注册、还没定「成为 X」目标的用户,进地图弹一次,
// 介绍新功能 + 让其挑一个目标。选或「以后再说」都记 goalPromptedAt,只弹一次。
// 与首进引导互斥:那个只对零进度新号;这个只对已有进度、没目标、没弹过的老号。

export function GoalPromptOverlay({
  bootstrap,
  roadmaps,
}: {
  bootstrap: GameBootstrap;
  roadmaps: RoadmapChoice[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dismissed, setDismissed] = useState(false);

  const show =
    bootstrap.onboarded &&
    !bootstrap.goalRoadmap &&
    !bootstrap.goalPrompted &&
    bootstrap.level.totalXp > 0 &&
    !dismissed;
  if (!show) return null;

  function pick(r: RoadmapChoice) {
    startTransition(async () => {
      const res = await setGoalRoadmap(r.id);
      if (res.ok) {
        rewardToast({ text: `目标已设为「${r.title}」`, tone: "coin" });
        celebrate({ kind: "quest", title: "目标已锁定!", subtitle: r.title });
      }
      setDismissed(true);
      router.refresh();
    });
  }

  function later() {
    startTransition(async () => {
      await dismissGoalPrompt();
      setDismissed(true);
      router.refresh();
    });
  }

  return (
    <div className="onboard-mask" role="dialog" aria-modal="true">
      <div className="onboard-card">
        <div className="onboard-hero">
          <Target size={28} aria-hidden />
        </div>
        <h1>给自己定个目标</h1>
        <p className="onboard-lead">
          必学堂新增了「成为 X」职业路线。选一条,地图顶部就会一直帮你导航
          「下一步」——不忘初心,一步步走到目标。之后随时能在路线页更换。
        </p>
        <div className="onboard-careers">
          {roadmaps.map((r) => (
            <button
              key={r.id}
              className="onboard-career"
              disabled={pending}
              onClick={() => pick(r)}
              style={{
                ["--tone" as string]: ROADMAP_TONE[r.id] ?? "var(--app-blue)",
              }}
            >
              <span className="onboard-career-icon">
                <CareerGlyph icon={r.icon} />
              </span>
              <span className="onboard-career-body">
                <b>{r.title}</b>
                {r.tagline ? <small>{r.tagline}</small> : null}
              </span>
            </button>
          ))}
          <CareerOther
            onDone={() => {
              setDismissed(true);
              router.refresh();
            }}
          />
        </div>
        <button className="onboard-skip" onClick={later} disabled={pending}>
          以后再说
        </button>
      </div>
    </div>
  );
}
