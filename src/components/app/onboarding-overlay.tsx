"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Atom,
  Brain,
  Cpu,
  Languages,
  Landmark,
  Sigma,
  Sparkles,
} from "lucide-react";
import type { GameBootstrap } from "@/lib/game/bootstrap-types";
import { completeOnboarding } from "@/lib/game/onboarding-actions";
import { celebrate } from "@/lib/celebrate";
import { rewardToast } from "@/lib/reward-feedback";

// 首次运行引导。新用户(未引导 + 零进度)进 /play 弹出:
//   欢迎 → 选一个目标(basic 入门线)→ 发启程礼包 + 指到第一关。
// 挂在 RouteMap 里,选目标复用它的 selectRoute(切线 + 存库)。

const SUBJECT_LABEL: Record<string, string> = {
  cs: "计算机",
  math: "数学",
  physics: "物理",
  ai: "人工智能",
  en: "英语",
  history: "历史",
};
const SUBJECT_TONE: Record<string, string> = {
  cs: "var(--app-blue)",
  math: "var(--app-teal)",
  physics: "var(--app-orange)",
  ai: "var(--app-green)",
  en: "var(--app-pink)",
  history: "var(--app-brown)",
};

function SubjectGlyph({ subject }: { subject: string }) {
  const s = 26;
  if (subject === "math") return <Sigma size={s} aria-hidden />;
  if (subject === "physics") return <Atom size={s} aria-hidden />;
  if (subject === "ai") return <Brain size={s} aria-hidden />;
  if (subject === "cs") return <Cpu size={s} aria-hidden />;
  if (subject === "en") return <Languages size={s} aria-hidden />;
  if (subject === "history") return <Landmark size={s} aria-hidden />;
  return <Sparkles size={s} aria-hidden />;
}

export function OnboardingOverlay({
  bootstrap,
  onPick,
}: {
  bootstrap: GameBootstrap;
  /** 复用 RouteMap.selectRoute:切线 + saveRouteChoice + 滚到第一关 */
  onPick: (pathId: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<"welcome" | "goal" | "done">("welcome");
  const [dismissed, setDismissed] = useState(false);
  const [chosen, setChosen] = useState<string>("");

  // 一学科一张卡:每个学科取第一条可选的 basic 入门线
  const goals = useMemo(() => {
    const bySubject = new Map<string, GameBootstrap["paths"][number]>();
    for (const p of bootstrap.paths) {
      if (p.tier === "basic" && p.unlocked && !bySubject.has(p.subject)) {
        bySubject.set(p.subject, p);
      }
    }
    return [...bySubject.values()];
  }, [bootstrap.paths]);

  // 只对未引导的零进度新用户显示
  const show =
    !bootstrap.onboarded && bootstrap.level.totalXp === 0 && !dismissed;
  if (!show) return null;

  function pick(p: GameBootstrap["paths"][number]) {
    setChosen(p.title);
    onPick(p.id); // 立刻切线,让地图在浮层关掉前就定位到第一关
    startTransition(async () => {
      const r = await completeOnboarding(p.id);
      if (r.coins) {
        rewardToast({ text: `启程礼包 +${r.coins} 金币`, tone: "coin" });
        celebrate({
          kind: "quest",
          title: "启程!",
          subtitle: `已为你选好「${p.title}」`,
        });
      }
      setStep("done");
    });
  }

  function close() {
    setDismissed(true);
    router.refresh(); // 让 bootstrap.onboarded 变真、导航恢复
  }

  function skip() {
    startTransition(async () => {
      await completeOnboarding(null);
      close();
    });
  }

  return (
    <div className="onboard-mask" role="dialog" aria-modal="true">
      <div className="onboard-card">
        {step === "welcome" ? (
          <>
            <div className="onboard-hero">
              <Sparkles size={30} aria-hidden />
            </div>
            <h1>欢迎来到必学堂</h1>
            <p className="onboard-lead">
              把公开课学成闯关。先选一个想入门的方向,我们给你排好第一条路线,
              5 分钟就能迈出第一步。
            </p>
            <button className="onboard-primary" onClick={() => setStep("goal")}>
              开始
            </button>
            <button className="onboard-skip" onClick={skip} disabled={pending}>
              先逛逛
            </button>
          </>
        ) : step === "goal" ? (
          <>
            <h1>先从哪个方向入门?</h1>
            <p className="onboard-lead">选一个开始,之后随时能换或加线。</p>
            <div className="onboard-goals">
              {goals.map((p) => (
                <button
                  key={p.id}
                  className="onboard-goal"
                  disabled={pending}
                  onClick={() => pick(p)}
                  style={{ ["--tone" as string]: SUBJECT_TONE[p.subject] }}
                >
                  <span className="onboard-goal-icon">
                    <SubjectGlyph subject={p.subject} />
                  </span>
                  <b>{p.title}</b>
                  <small>{SUBJECT_LABEL[p.subject] ?? p.subject}</small>
                </button>
              ))}
            </div>
            <button className="onboard-skip" onClick={skip} disabled={pending}>
              先逛逛
            </button>
          </>
        ) : (
          <>
            <div className="onboard-hero onboard-hero-ok">
              <Sparkles size={30} aria-hidden />
            </div>
            <h1>启程!</h1>
            <p className="onboard-lead">
              已为你选好「{chosen}」并送上启程礼包。地图上高亮的就是你的第一关,
              点它开始学习 →
            </p>
            <button className="onboard-primary" onClick={close}>
              开始学习
            </button>
          </>
        )}
      </div>
    </div>
  );
}
