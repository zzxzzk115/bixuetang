"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Ghost, Swords, X } from "lucide-react";
import type { PkOutcome } from "@/lib/game/elo";
import {
  submitPkMatch,
  type PkGhostDto,
  type PkSettleResult,
} from "@/lib/game/pk-actions";
import type { QuizQuestion } from "@/lib/game/quiz-draw";
import type { SessionPerks } from "@/lib/game/session-perks";

// 幽灵对战会话：与录像同屏竞速。你在答第 i 题时，幽灵会在它当年的
// 用时点「作答」（顶部chip 闪现）；对错在你交卷该题后揭晓。
// 比分先比答对数、再比总用时，赛后 ELO 结算排位分。

const FEEDBACK_MS = 1300;

interface Props {
  seed: number;
  questions: QuizQuestion[];
  perks: SessionPerks;
  ghost: PkGhostDto;
  onExit: () => void;
  onRematch: () => void;
}

export function PkSession({
  seed,
  questions,
  perks,
  ghost,
  onExit,
  onRematch,
}: Props) {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"question" | "feedback" | "result">(
    "question",
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [ghostAnswered, setGhostAnswered] = useState(false);
  const [outcomes, setOutcomes] = useState<PkOutcome[]>([]);
  const [settle, setSettle] = useState<PkSettleResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ghostRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef(0);
  const settledRef = useRef(false);

  const q = questions[idx];
  const myScore = outcomes.reduce((s, o) => s + o.c, 0);
  // 幽灵比分只算「已经打完的题」，不剧透后面
  const ghostScore = ghost.outcomes
    .slice(0, phase === "feedback" ? idx + 1 : idx)
    .reduce((s, o) => s + o.c, 0);

  const finish = useCallback(
    async (finalOutcomes: PkOutcome[]) => {
      setPhase("result");
      if (settledRef.current) return;
      settledRef.current = true;
      const r = await submitPkMatch(seed, ghost.runId, finalOutcomes);
      setSettle(r);
    },
    [seed, ghost.runId],
  );

  const answer = useCallback(
    (i: number | null) => {
      if (phase !== "question" || !q) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      const t = Math.min(
        Math.round(performance.now() - startRef.current),
        perks.timeLimitSec * 1000,
      );
      const c: 0 | 1 = i !== null && i === q.answerIndex ? 1 : 0;
      const next = [...outcomes, { c, t }];
      setOutcomes(next);
      setSelected(i);
      setPhase("feedback");
      setTimeout(() => {
        if (next.length >= questions.length) return void finish(next);
        setIdx(next.length);
        setSelected(null);
        setGhostAnswered(false);
        setPhase("question");
      }, FEEDBACK_MS);
    },
    [phase, q, outcomes, questions.length, perks.timeLimitSec, finish],
  );

  // 倒计时 + 幽灵作答时点回放
  useEffect(() => {
    if (phase !== "question") return;
    startRef.current = performance.now();
    timerRef.current = setTimeout(() => answer(null), perks.timeLimitSec * 1000);
    const g = ghost.outcomes[idx];
    if (g) {
      ghostRef.current = setTimeout(
        () => setGhostAnswered(true),
        Math.min(g.t, perks.timeLimitSec * 1000 - 200),
      );
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (ghostRef.current) clearTimeout(ghostRef.current);
    };
  }, [phase, idx, perks.timeLimitSec, ghost.outcomes, answer]);

  if (phase === "result") {
    const won = settle?.result === 1;
    const draw = settle?.result === 0.5;
    const delta =
      settle?.ratingAfter !== undefined && settle?.ratingBefore !== undefined
        ? settle.ratingAfter - settle.ratingBefore
        : 0;
    const finalGhostScore = ghost.outcomes.reduce((s, o) => s + o.c, 0);
    return (
      <div className="quiz-root">
        <div className="quiz-result">
          <span
            className={`quiz-result-icon ${settle == null || won ? "pass" : "fail"}`}
            aria-hidden
          >
            <Swords size={44} strokeWidth={2.2} />
          </span>
          <h1>
            {settle == null
              ? "结算中…"
              : won
                ? "胜利！"
                : draw
                  ? "平局"
                  : "惜败"}
          </h1>
          <div className="pk-scoreline">
            <span className="me">
              我 <b>{myScore}</b>
            </span>
            <small>VS</small>
            <span className="ghost">
              <b>{finalGhostScore}</b> {ghost.name}
            </span>
          </div>
          {settle?.ok && (
            <p className="quiz-result-note">
              排位分 {settle.ratingBefore} →{" "}
              <b className={delta >= 0 ? "pk-up" : "pk-down"}>
                {settle.ratingAfter}
              </b>{" "}
              （{delta >= 0 ? "+" : ""}
              {delta}） · {settle.rankLabel}
              {settle.gained ? (
                <>
                  <br />
                  每日首胜 +{settle.gained} XP · +{settle.coins} 金币
                </>
              ) : null}
            </p>
          )}
          <div className="quiz-result-actions">
            <button className="app-btn-primary" onClick={onRematch}>
              再来一场
            </button>
            <button className="app-btn-plain" onClick={onExit}>
              返回
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!q) return null;
  const g = ghost.outcomes[idx];

  return (
    <div className="quiz-root">
      <header className="quiz-head">
        <button className="quiz-close" onClick={onExit} aria-label="退出">
          <X size={26} />
        </button>
        <div className="pk-hud">
          <span className="pk-side me">
            我 <b>{myScore}</b>
          </span>
          <span className="pk-progress">
            {idx + 1}/{questions.length}
          </span>
          <span className="pk-side ghost">
            <Ghost size={16} aria-hidden />
            <b>{ghostScore}</b> {ghost.name}
          </span>
        </div>
      </header>

      <div className="quiz-timer" key={idx}>
        <i style={{ animationDuration: `${perks.timeLimitSec}s` }} />
      </div>

      <main className="quiz-body">
        <p className="quiz-kind">
          {q.kind === "term" ? "这个术语是什么意思？" : "关于这个知识点，哪个说法对？"}
        </p>
        <h1 className="quiz-prompt">{q.prompt}</h1>
        <div className="quiz-options">
          {q.options.map((opt, i) => {
            let cls = "quiz-option";
            if (phase === "feedback") {
              if (i === q.answerIndex) cls += " right";
              else if (i === selected) cls += " wrong";
              else cls += " dim";
            }
            return (
              <button
                key={i}
                className={cls}
                disabled={phase === "feedback"}
                onClick={() => answer(i)}
              >
                {opt}
              </button>
            );
          })}
        </div>
        <div className="quiz-underline">
          {phase === "feedback" && g ? (
            <p className={`pk-ghost-reveal ${g.c ? "hit" : "miss"}`}>
              👻 {g.c ? "答对了" : "答错了"}（{(g.t / 1000).toFixed(1)}s）
            </p>
          ) : ghostAnswered ? (
            <p className="pk-ghost-chip">👻 幽灵已作答…</p>
          ) : null}
        </div>
      </main>
    </div>
  );
}
