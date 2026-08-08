"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Atom, Brain, Cpu, Languages, Landmark, Sigma, Sparkles } from "lucide-react";
import type { GameBootstrap } from "@/lib/game/bootstrap-types";
import type { RoadmapChoice } from "@/lib/game/roadmap-choices";
import { completeOnboarding } from "@/lib/game/onboarding-actions";
import { celebrate } from "@/lib/celebrate";
import { rewardToast } from "@/lib/reward-feedback";
import { CareerGlyph, ROADMAP_TONE } from "./career-glyph";

// 首次运行引导。新用户(未引导 + 零进度)进 /play 弹出:
//   欢迎 → 选「成为 X」职业目标(或退回选单科入门)→ 发启程礼包 + 指到第一关。
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

type Step = "welcome" | "career" | "subject" | "done";

export function OnboardingOverlay({
  bootstrap,
  roadmaps,
  onPick,
}: {
  bootstrap: GameBootstrap;
  /** 首进「成为 X」职业目标卡 */
  roadmaps: RoadmapChoice[];
  /** 复用 RouteMap.selectRoute:切线 + saveRouteChoice + 滚到第一关 */
  onPick: (pathId: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>("welcome");
  const [dismissed, setDismissed] = useState(false);
  const [chosen, setChosen] = useState<string>("");

  // 一学科一张卡:每个学科取第一条可选的 basic 入门线(退回单科时用)
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

  // 选定单科入门线(退回路径):切线 + 发礼包
  function pick(p: GameBootstrap["paths"][number]) {
    setChosen(p.title);
    onPick(p.id); // 立刻切线,让地图在浮层关掉前就定位到第一关
    startTransition(async () => {
      const r = await completeOnboarding({ pathId: p.id });
      finish(p.title, r.coins);
    });
  }

  // 选定「成为 X」职业目标:存目标 + 尽量把地图切到含首门课的路线
  function pickCareer(r: RoadmapChoice) {
    setChosen(r.title);
    const route = bootstrap.paths.find(
      (p) => p.mode === "course" && p.courseIds.includes(r.firstCourseId),
    );
    if (route) onPick(route.id);
    startTransition(async () => {
      const res = await completeOnboarding({
        goalRoadmap: r.id,
        pathId: route?.id ?? null,
      });
      finish(r.title, res.coins);
    });
  }

  function finish(title: string, coins?: number) {
    if (coins) {
      rewardToast({ text: `启程礼包 +${coins} 金币`, tone: "coin" });
      celebrate({
        kind: "quest",
        title: "启程!",
        subtitle: `已为你选好「${title}」`,
      });
    }
    setStep("done");
  }

  function close() {
    setDismissed(true);
    router.refresh(); // 让 bootstrap.onboarded 变真、导航恢复
  }

  function skip() {
    startTransition(async () => {
      await completeOnboarding({});
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
              把公开课学成闯关。先想好你要成为什么,我们把散落的公开课串成一条
              清晰的路,陪你从第一关走到目标。
            </p>
            <button
              className="onboard-primary"
              onClick={() => setStep("career")}
            >
              开始
            </button>
            <button className="onboard-skip" onClick={skip} disabled={pending}>
              先逛逛
            </button>
          </>
        ) : step === "career" ? (
          <>
            <h1>你想成为?</h1>
            <p className="onboard-lead">
              选一个目标,我们按「成为 X」的路线给你排好该先学什么。之后随时能换。
            </p>
            <div className="onboard-careers">
              {roadmaps.map((r) => (
                <button
                  key={r.id}
                  className="onboard-career"
                  disabled={pending}
                  onClick={() => pickCareer(r)}
                  style={{
                    ["--tone" as string]:
                      ROADMAP_TONE[r.id] ?? "var(--app-blue)",
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
            </div>
            <button
              className="onboard-alt"
              onClick={() => setStep("subject")}
              disabled={pending}
            >
              只想学某一科 →
            </button>
            <button className="onboard-skip" onClick={skip} disabled={pending}>
              随便逛逛
            </button>
          </>
        ) : step === "subject" ? (
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
            <button
              className="onboard-alt"
              onClick={() => setStep("career")}
              disabled={pending}
            >
              ← 看职业目标
            </button>
            <button className="onboard-skip" onClick={skip} disabled={pending}>
              随便逛逛
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
