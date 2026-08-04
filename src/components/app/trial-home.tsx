"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, Swords, Timer, Zap } from "lucide-react";
import type { GameBootstrap } from "@/lib/game/bootstrap-types";
import type { QuizQuestion } from "@/lib/game/quiz-draw";
import { getTrialBatch } from "@/lib/game/quiz-actions";
import type { SessionPerks } from "@/lib/game/session-perks";
import { AppShell } from "./app-shell";
import { QuizSession } from "./quiz-session";

// 试炼场首页：无限限时挑战。全学科混合抽题、3 条命、逐题限时，
// 命尽结算——每天第一场按成绩发 XP + 金币，之后当练习。

export function TrialHome({ bootstrap }: { bootstrap: GameBootstrap }) {
  const router = useRouter();
  const [session, setSession] = useState<{
    questions: QuizQuestion[];
    perks: SessionPerks;
  } | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      const r = await getTrialBatch(null, Date.now() & 0x7fffffff);
      if (!r.ok || !r.questions) {
        setError(r.error ?? "出题失败，稍后再试");
        return;
      }
      setSession({ questions: r.questions, perks: r.perks! });
    } finally {
      setStarting(false);
    }
  };

  if (session) {
    return (
      <QuizSession
        mode="trial"
        questions={session.questions}
        perks={session.perks}
        onExit={() => {
          setSession(null);
          router.refresh(); // 刷新今日奖励状态与顶栏金币
        }}
      />
    );
  }

  return (
    <AppShell bootstrap={bootstrap}>
      <div className="trial-home">
        <span className="trial-home-icon">
          <Swords size={44} strokeWidth={2} />
        </span>
        <h1>无限试炼</h1>
        <p>全学科题目连续来袭，看你能答对多少道！</p>
        <ul className="trial-rules">
          <li>
            <Heart size={18} aria-hidden /> 3 条命，答错或超时扣一条
          </li>
          <li>
            <Timer size={18} aria-hidden /> 每题限时，专注属性越高时间越长
          </li>
          <li>
            <Zap size={18} aria-hidden /> 每日首战按成绩发 XP 和金币
          </li>
        </ul>
        {bootstrap.trialClaimedToday && (
          <p className="trial-claimed">今日奖励已领取 · 现在开打算练习</p>
        )}
        {error && <p className="trial-error">{error}</p>}
        <button className="app-btn-primary" onClick={start} disabled={starting}>
          {starting ? "备战中…" : "开始试炼"}
        </button>
      </div>
    </AppShell>
  );
}
