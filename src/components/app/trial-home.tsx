"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ghost, Heart, Swords, Timer, Trophy, Zap } from "lucide-react";
import type { GameBootstrap } from "@/lib/game/bootstrap-types";
import type { PkOverview } from "@/lib/game/pk";
import type { LeagueOverview } from "@/lib/game/league-server";
import type { DailyProgress } from "@/lib/game/daily-goal";
import { LeaguePanel } from "./league-panel";
import { DailyGoalRing } from "./daily-goal-ring";
import {
  getPkMatch,
  type PkGhostDto,
  type PkMatchPayload,
} from "@/lib/game/pk-actions";
import { getTrialBatch } from "@/lib/game/quiz-actions";
import type { QuizQuestion } from "@/lib/game/quiz-draw";
import type { SessionPerks } from "@/lib/game/session-perks";
import type { DailyQuestView, MonthlyQuestView } from "@/lib/game/quests";
import { DailyQuestBoard } from "@/components/daily-quest-board";
import { notifyQuestsChanged } from "@/lib/quest-events";
import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { AppShell } from "./app-shell";
import { PkSession } from "./pk-session";
import { QuizSession } from "./quiz-session";

// 试炼场首页：两种玩法。
//   无限试炼 —— 全学科连续答题，生命耗尽结算，每日首战发奖
//   幽灵对战 —— 挑战真人对局录像，同套题竞速，ELO 排位分 + 段位

type Session =
  | { kind: "trial"; questions: QuizQuestion[]; perks: SessionPerks }
  | {
      kind: "pk";
      seed: number;
      questions: QuizQuestion[];
      perks: SessionPerks;
      ghost: PkGhostDto;
      /** 换场重挂载用 */
      nonce: number;
    };

export function TrialHome({
  bootstrap,
  pk,
  league,
  calmMode = false,
  dailyGoal,
  quests,
  monthly,
  dueCount,
}: {
  bootstrap: GameBootstrap;
  pk: PkOverview;
  /** 段位联赛(按本周经验升降段,取代旧的 ELO 段位) */
  league: LeagueOverview;
  /** 静心模式:隐藏段位联赛与幽灵对战等竞争元素 */
  calmMode?: boolean;
  /** 每日目标进度 */
  dailyGoal: DailyProgress;
  /** 每日任务(从地图页搬来:任务本就偏「今天该做什么」,和试炼同属日常) */
  quests: DailyQuestView[];
  monthly: MonthlyQuestView;
  dueCount: number;
}) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [starting, setStarting] = useState<"trial" | "pk" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startTrial = async () => {
    if (starting) return;
    setStarting("trial");
    setError(null);
    try {
      const r = await getTrialBatch(null, Date.now() & 0x7fffffff);
      if (!r.ok || !r.questions) return setError(r.error ?? "出题失败");
      setSession({ kind: "trial", questions: r.questions, perks: r.perks! });
    } finally {
      setStarting(null);
    }
  };

  const startPk = async () => {
    if (starting) return;
    setStarting("pk");
    setError(null);
    try {
      const r: PkMatchPayload = await getPkMatch();
      if (!r.ok || !r.questions) return setError(r.error ?? "匹配失败");
      setSession({
        kind: "pk",
        seed: r.seed!,
        questions: r.questions,
        perks: r.perks!,
        ghost: r.ghost!,
        nonce: Date.now(),
      });
    } finally {
      setStarting(null);
    }
  };

  const exitSession = () => {
    setSession(null);
    router.refresh(); // 刷新排位分/今日奖励/顶栏金币
    notifyQuestsChanged(); // 可能推进「今天打一场试炼」任务
  };

  if (session?.kind === "trial") {
    return (
      <QuizSession
        mode="trial"
        questions={session.questions}
        perks={session.perks}
        onExit={exitSession}
      />
    );
  }
  if (session?.kind === "pk") {
    return (
      <PkSession
        key={session.nonce}
        seed={session.seed}
        questions={session.questions}
        perks={session.perks}
        ghost={session.ghost}
        onExit={exitSession}
        onRematch={startPk}
      />
    );
  }

  return (
    <AppShell bootstrap={bootstrap}>
      <div className="trial-root">
        {/* 每日任务与今日复习:日常清单,和试炼一起构成「今天的功课」 */}
        <section className="trial-daily">
          <div className="trial-section-head">
            <span className="trial-section-kicker">TODAY</span>
            <h2>今天的功课</h2>
            <p>看一集 · 清复习 · 打一场,三件小事攒满今日</p>
          </div>
          <DailyGoalRing initial={dailyGoal} />
          {dueCount > 0 && (
            <Link href="/review" className="review-entry">
              <span className="review-entry-icon" aria-hidden>
                <RotateCcw size={18} />
              </span>
              <span className="review-entry-body">
                <b>今日复习</b>
                <small>{dueCount} 张卡片到期,清空续上记忆曲线</small>
              </span>
              <span className="review-entry-count">{dueCount}</span>
            </Link>
          )}
          <DailyQuestBoard quests={quests} monthly={monthly} />
        </section>

        {!calmMode && (
          <section className="trial-league">
            <div className="trial-section-head">
              <span className="trial-section-kicker">RANKED</span>
              <h2>段位联赛</h2>
            </div>
            <LeaguePanel overview={league} />
          </section>
        )}

        <section className="trial-mode">
          <span className="trial-mode-icon endless">
            <Swords size={30} strokeWidth={2.2} />
          </span>
          <div className="trial-mode-body">
            <h2>无限试炼</h2>
            <p>全学科题目连续来袭，看你能答对多少道</p>
            <ul className="trial-rules">
              <li>
                <Heart size={16} aria-hidden /> 生命耗尽结束,答错或超时扣一条;
                等级越高血条越长
                {bootstrap.rpg.shieldHearts > 0 && (
                  <em className="trial-shield-note">
                    {" "}· 🛡️ 护盾血 ×{bootstrap.rpg.shieldHearts} 先替你挡
                  </em>
                )}
              </li>
              <li>
                <Timer size={16} aria-hidden /> 每题限时，四维与装备改写手感
              </li>
              <li>
                <Zap size={16} aria-hidden /> 每日首战按成绩发 XP 和金币
              </li>
            </ul>
            {bootstrap.trialClaimedToday && (
              <p className="trial-claimed">今日奖励已领取 · 现在开打算练习</p>
            )}
            <button
              className="app-btn-primary"
              onClick={startTrial}
              disabled={starting !== null}
            >
              {starting === "trial" ? "备战中…" : "开始试炼"}
            </button>
          </div>
        </section>

        {!calmMode && (
        <section className="trial-mode">
          <span className="trial-mode-icon pk">
            <Ghost size={30} strokeWidth={2.2} />
          </span>
          <div className="trial-mode-body">
            <h2>幽灵对战</h2>
            <p>挑战其他学者的对局录像：同一套题、同屏竞速</p>
            <p className="trial-pk-record">
              <Trophy size={15} aria-hidden /> {pk.wins} 胜 {pk.losses} 负
            </p>
            <button
              className="app-btn-primary"
              onClick={startPk}
              disabled={starting !== null}
            >
              {starting === "pk" ? "搜寻幽灵…" : "匹配对手"}
            </button>
          </div>
        </section>
        )}

        {error && <p className="trial-error">{error}</p>}
      </div>
    </AppShell>
  );
}
