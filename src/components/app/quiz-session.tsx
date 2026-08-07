"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Flame, Heart, Lightbulb, ShieldHalf, X, Zap } from "lucide-react";
import type { QuizQuestion } from "@/lib/game/quiz-draw";
import {
  getTrialBatch,
  settleTrialRun,
  submitQuizNode,
  type QuizSettleResult,
  type TrialSettleResult,
} from "@/lib/game/quiz-actions";
import type { SessionPerks } from "@/lib/game/session-perks";

// 全屏答题会话（多邻国式）：顶部 X + 进度/生命，中间题面，下面四个大选项。
// 两种模式：
//   lesson — 课程测验节点：固定题量，答完交卷（≥60% 通过，首通发 XP）
//   trial  — 无限试炼：生命耗尽结算（每日首战发奖）；题目快用完时续抽
// 四维在这里生效（perks）：专注=限时、洞察=排除提示、意志=试炼生命、
// 精准=快答窗口（快答有额外 XP）。装备遗物加四维 → 道具效果闭环。

const FEEDBACK_MS = 1100;

interface Props {
  mode: "lesson" | "trial";
  questions: QuizQuestion[];
  perks: SessionPerks;
  /** lesson 模式 */
  courseId?: string;
  quizIndex?: number;
  /** trial 模式：退出回调（回到试炼首页） */
  onExit?: () => void;
}

export function QuizSession({
  mode,
  questions: initial,
  perks,
  courseId,
  quizIndex,
  onExit,
}: Props) {
  const router = useRouter();
  const [questions, setQuestions] = useState(initial);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"question" | "feedback" | "result">(
    "question",
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [fastCount, setFastCount] = useState(0);
  const [wasFast, setWasFast] = useState(false);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [hearts, setHearts] = useState(perks.hearts);
  // 护盾血(蓝心):答错先扣它,扣完才动红心;结算时回写剩余数
  const [shields, setShields] = useState(perks.shieldHearts);
  const shieldsRef = useRef(perks.shieldHearts);
  const [hintsLeft, setHintsLeft] = useState(perks.hints);
  const [excluded, setExcluded] = useState<number[]>([]);
  const [settle, setSettle] = useState<
    QuizSettleResult | TrialSettleResult | null
  >(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef(0);
  const settledRef = useRef(false);
  const fetchingRef = useRef(false);

  const q = questions[idx];

  const finish = useCallback(
    async (finalCorrect: number, finalFast: number) => {
      setPhase("result");
      if (settledRef.current) return;
      settledRef.current = true;
      if (mode === "lesson" && courseId !== undefined && quizIndex !== undefined) {
        const r = await submitQuizNode(
          courseId,
          quizIndex,
          finalCorrect,
          questions.length,
          finalFast,
        );
        setSettle(r);
      } else {
        // 护盾血消耗回写(shieldsRef 是当前剩余)
        const r = await settleTrialRun(
          finalCorrect,
          finalFast,
          shieldsRef.current,
        );
        setSettle(r);
      }
    },
    [mode, courseId, quizIndex, questions.length],
  );

  const advance = useCallback(
    (wasCorrect: boolean, wasFastAnswer: boolean) => {
      const nextCorrect = correct + (wasCorrect ? 1 : 0);
      const nextFast = fastCount + (wasFastAnswer ? 1 : 0);
      if (mode === "trial" && !wasCorrect) {
        // 先扣护盾血(蓝心),扣完才动红心
        if (shieldsRef.current > 0) {
          shieldsRef.current -= 1;
          setShields(shieldsRef.current);
        } else {
          const left = hearts - 1;
          setHearts(left);
          if (left <= 0) return void finish(nextCorrect, nextFast);
        }
      }
      const next = idx + 1;
      if (next >= questions.length) {
        // lesson 答完交卷；trial 题目耗尽（续抽失败）也算打完
        return void finish(nextCorrect, nextFast);
      }
      setIdx(next);
      setSelected(null);
      setExcluded([]);
      setWasFast(false);
      setPhase("question");
    },
    [correct, fastCount, hearts, idx, questions.length, mode, finish],
  );

  const answer = useCallback(
    (i: number | null) => {
      if (phase !== "question" || !q) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      const wasCorrect = i !== null && i === q.answerIndex;
      const elapsed = performance.now() - startRef.current;
      const fastAnswer =
        wasCorrect && elapsed <= perks.fastRatio * perks.timeLimitSec * 1000;
      setSelected(i);
      setWasFast(fastAnswer);
      setPhase("feedback");
      if (wasCorrect) {
        setCorrect((c) => c + 1);
        if (fastAnswer) setFastCount((c) => c + 1);
        setCombo((c) => {
          const n = c + 1;
          setMaxCombo((m) => Math.max(m, n));
          return n;
        });
      } else {
        setCombo(0);
      }
      setTimeout(() => advance(wasCorrect, fastAnswer), FEEDBACK_MS);
    },
    [phase, q, perks, advance],
  );

  // 逐题倒计时：超时按答错处理；同时记录起点供快答判定
  useEffect(() => {
    if (phase !== "question") return;
    startRef.current = performance.now();
    timerRef.current = setTimeout(
      () => answer(null),
      perks.timeLimitSec * 1000,
    );
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, idx, perks.timeLimitSec, answer]);

  // trial：快见底就续抽一批（去掉本场已出过的题面）
  useEffect(() => {
    if (mode !== "trial" || phase === "result") return;
    if (questions.length - idx > 4 || fetchingRef.current) return;
    fetchingRef.current = true;
    getTrialBatch(null, (Date.now() & 0x7fffffff) ^ questions.length)
      .then((r) => {
        if (!r.ok || !r.questions) return;
        setQuestions((prev) => {
          const seen = new Set(prev.map((p) => p.prompt));
          return [...prev, ...r.questions!.filter((n) => !seen.has(n.prompt))];
        });
      })
      .finally(() => {
        fetchingRef.current = false;
      });
  }, [mode, idx, questions.length, phase]);

  // 洞察提示：排除一个错误选项
  const useHint = () => {
    if (phase !== "question" || hintsLeft <= 0 || !q) return;
    const candidates = q.options
      .map((_, i) => i)
      .filter((i) => i !== q.answerIndex && !excluded.includes(i));
    if (candidates.length <= 1) return; // 至少留一个错误项，不然等于送分
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    setExcluded((prev) => [...prev, pick]);
    setHintsLeft((n) => n - 1);
  };

  const exit = () => {
    if (mode === "lesson") router.push("/play");
    else onExit?.();
  };

  if (phase === "result") {
    const lesson = settle as QuizSettleResult | null;
    const trial = settle as TrialSettleResult | null;
    // 通过与否本地即可判定（与服务端同一条 60% 线），不等结算返回，避免闪错误状态
    const passed =
      mode === "lesson" ? correct / questions.length >= 0.6 : true;
    return (
      <div className="quiz-root">
        <div className="quiz-result">
          <span
            className={`quiz-result-icon ${passed ? "pass" : "fail"}`}
            aria-hidden
          >
            {passed ? <Zap size={44} strokeWidth={2.2} /> : <X size={44} />}
          </span>
          <h1>
            {mode === "trial"
              ? "试炼结束"
              : passed
                ? "测验通过！"
                : "差一点点"}
          </h1>
          <div className="quiz-result-stats">
            <div>
              <b>{correct}</b>
              <small>答对</small>
            </div>
            {fastCount > 0 && (
              <div>
                <b>⚡{fastCount}</b>
                <small>快答</small>
              </div>
            )}
            {mode === "trial" ? (
              <div>
                <b>{maxCombo}</b>
                <small>最高连击</small>
              </div>
            ) : (
              <div>
                <b>
                  {correct}/{questions.length}
                </b>
                <small>正确率</small>
              </div>
            )}
          </div>
          {settle == null ? (
            <p className="quiz-result-note">结算中…</p>
          ) : mode === "lesson" ? (
            <p className="quiz-result-note">
              {!passed
                ? "正确率达到 60% 才能通过，再试一次！"
                : lesson!.gained
                  ? `+${lesson!.gained} XP${lesson!.levelUp ? ` · 升到 ${lesson!.newLevel} 级！` : ""}`
                  : "复习完成（奖励首次通过时已发）"}
            </p>
          ) : (
            <p className="quiz-result-note">
              {trial!.already
                ? "今日奖励已领过，这场算练习"
                : trial!.gained
                  ? `+${trial!.gained} XP · +${trial!.coins} 金币`
                  : "答对 1 题以上才有奖励"}
            </p>
          )}
          <div className="quiz-result-actions">
            {mode === "lesson" && !passed && (
              <button
                className="app-btn-primary"
                onClick={() => router.refresh()}
              >
                重新挑战
              </button>
            )}
            <button
              className={passed && mode === "lesson" ? "app-btn-primary" : "app-btn-plain"}
              onClick={exit}
            >
              {mode === "trial" ? "返回" : "回到地图"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!q) return null;

  return (
    <div className="quiz-root">
      <header className="quiz-head">
        <button className="quiz-close" onClick={exit} aria-label="退出">
          <X size={26} />
        </button>
        {mode === "lesson" ? (
          <div className="quiz-progress">
            <i
              style={{ width: `${(idx / questions.length) * 100}%` }}
              aria-hidden
            />
          </div>
        ) : (
          <div className="quiz-trial-hud">
            <span className="quiz-score">
              <Zap size={16} aria-hidden /> {correct}
            </span>
            {combo >= 2 && (
              <span className="quiz-combo">
                <Flame size={16} aria-hidden /> x{combo}
              </span>
            )}
            <span className="quiz-hearts">
              {/* 护盾血(蓝心)排在红心前,先被扣 */}
              {Array.from({ length: perks.shieldHearts }, (_, i) => (
                <ShieldHalf
                  key={`s${i}`}
                  size={20}
                  className={`quiz-shield ${i < shields ? "" : "empty"}`}
                  fill={i < shields ? "currentColor" : "none"}
                />
              ))}
              {Array.from({ length: perks.hearts }, (_, i) => (
                <Heart
                  key={i}
                  size={20}
                  fill={i < hearts ? "currentColor" : "none"}
                  className={i < hearts ? "" : "empty"}
                />
              ))}
            </span>
          </div>
        )}
      </header>

      {/* 倒计时条：key 换题重置动画 */}
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
            } else if (excluded.includes(i)) {
              cls += " excluded";
            }
            return (
              <button
                key={i}
                className={cls}
                disabled={phase === "feedback" || excluded.includes(i)}
                onClick={() => answer(i)}
              >
                {opt}
              </button>
            );
          })}
        </div>
        <div className="quiz-underline">
          {phase === "feedback" ? (
            selected === null ? (
              <p className="quiz-timeout">时间到！</p>
            ) : wasFast ? (
              <p className="quiz-fast">⚡ 快答 +1</p>
            ) : null
          ) : (
            hintsLeft > 0 && (
              <button className="quiz-hint" onClick={useHint}>
                <Lightbulb size={17} aria-hidden />
                排除一项 ×{hintsLeft}
              </button>
            )
          )}
        </div>
      </main>
    </div>
  );
}
