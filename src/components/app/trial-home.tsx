"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ghost, Heart, Swords, Timer, Trophy, Zap } from "lucide-react";
import type { GameBootstrap } from "@/lib/game/bootstrap-types";
import type { PkOverview } from "@/lib/game/pk";
import {
  getPkMatch,
  type PkGhostDto,
  type PkMatchPayload,
} from "@/lib/game/pk-actions";
import { getTrialBatch } from "@/lib/game/quiz-actions";
import type { QuizQuestion } from "@/lib/game/quiz-draw";
import type { SessionPerks } from "@/lib/game/session-perks";
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
}: {
  bootstrap: GameBootstrap;
  pk: PkOverview;
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
        <section className="trial-mode">
          <span className="trial-mode-icon endless">
            <Swords size={30} strokeWidth={2.2} />
          </span>
          <div className="trial-mode-body">
            <h2>无限试炼</h2>
            <p>全学科题目连续来袭，看你能答对多少道</p>
            <ul className="trial-rules">
              <li>
                <Heart size={16} aria-hidden /> 生命耗尽结束，答错或超时扣一条
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

        <section className="trial-mode">
          <span className="trial-mode-icon pk">
            <Ghost size={30} strokeWidth={2.2} />
          </span>
          <div className="trial-mode-body">
            <h2>幽灵对战 · 排位</h2>
            <p>挑战其他学者的对局录像：同一套题、同屏竞速</p>
            <div className="pk-rank-card">
              <span className={`pk-rank-badge tier-${pk.rankKey}`}>
                <Trophy size={16} aria-hidden />
                {pk.rankLabel}
              </span>
              <b>{pk.rating}</b>
              <small>
                {pk.wins} 胜 {pk.losses} 负
              </small>
            </div>
            <button
              className="app-btn-primary"
              onClick={startPk}
              disabled={starting !== null}
            >
              {starting === "pk" ? "搜寻幽灵…" : "匹配对手"}
            </button>
          </div>
        </section>

        {pk.leaderboard.length > 0 && (
          <section className="trial-board">
            <h3>
              <Trophy size={16} aria-hidden /> 排行榜
            </h3>
            <ol>
              {pk.leaderboard.map((row, i) => (
                <li key={i} className={row.me ? "me" : undefined}>
                  <span className="trial-board-no">{i + 1}</span>
                  <span className="trial-board-name">
                    {row.name}
                    {row.me && <em>（我）</em>}
                  </span>
                  <small>{row.rankLabel}</small>
                  <b>{row.rating}</b>
                </li>
              ))}
            </ol>
          </section>
        )}

        {error && <p className="trial-error">{error}</p>}
      </div>
    </AppShell>
  );
}
