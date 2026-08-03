"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Flame, Heart, X, Zap } from "lucide-react";
import type { QuizQuestion } from "@/lib/game/quiz-draw";
import {
  getTrialBatch,
  settleTrialRun,
  submitQuizNode,
  type QuizSettleResult,
  type TrialSettleResult,
} from "@/lib/game/quiz-actions";

// 全屏答题会话（多邻国式）：顶部 X + 进度/生命，中间题面，下面四个大选项。
// 两种模式：
//   lesson — 课程测验节点：固定题量，答完交卷（≥60% 通过，首通发 XP）
//   trial  — 无限试炼：3 条命，答错扣命，命尽结算（每日首战发奖）；题目快用完时续抽

const FEEDBACK_MS = 1100;
const TRIAL_HEARTS = 3;

interface Props {
  mode: "lesson" | "trial";
  questions: QuizQuestion[];
  timeLimitSec: number;
  /** lesson 模式 */
  courseId?: string;
  quizIndex?: number;
  /** trial 模式：退出回调（回到试炼首页） */
  onExit?: () => void;
}

export function QuizSession({
  mode,
  questions: initial,
  timeLimitSec,
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
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [hearts, setHearts] = useState(TRIAL_HEARTS);
  const [settle, setSettle] = useState<
    QuizSettleResult | TrialSettleResult | null
  >(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settledRef = useRef(false);
  const fetchingRef = useRef(false);

  const q = questions[idx];

  const finish = useCallback(
    async (finalCorrect: number) => {
      setPhase("result");
      if (settledRef.current) return;
      settledRef.current = true;
      if (mode === "lesson" && courseId !== undefined && quizIndex !== undefined) {
        const r = await submitQuizNode(
          courseId,
          quizIndex,
          finalCorrect,
          questions.length,
        );
        setSettle(r);
      } else {
        const r = await settleTrialRun(finalCorrect);
        setSettle(r);
      }
    },
    [mode, courseId, quizIndex, questions.length],
  );

  const advance = useCallback(
    (wasCorrect: boolean) => {
      const nextCorrect = correct + (wasCorrect ? 1 : 0);
      if (mode === "trial" && !wasCorrect) {
        const left = hearts - 1;
        setHearts(left);
        if (left <= 0) return void finish(nextCorrect);
      }
      const next = idx + 1;
      if (next >= questions.length) {
        if (mode === "lesson") return void finish(nextCorrect);
        // trial 题目耗尽（续抽失败/太快）也算打完
        return void finish(nextCorrect);
      }
      setIdx(next);
      setSelected(null);
      setPhase("question");
    },
    [correct, hearts, idx, questions.length, mode, finish],
  );

  const answer = useCallback(
    (i: number | null) => {
      if (phase !== "question" || !q) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      const wasCorrect = i !== null && i === q.answerIndex;
      setSelected(i);
      setPhase("feedback");
      if (wasCorrect) {
        setCorrect((c) => c + 1);
        setCombo((c) => {
          const n = c + 1;
          setMaxCombo((m) => Math.max(m, n));
          return n;
        });
      } else {
        setCombo(0);
      }
      setTimeout(() => advance(wasCorrect), FEEDBACK_MS);
    },
    [phase, q, advance],
  );

  // 逐题倒计时：超时按答错处理
  useEffect(() => {
    if (phase !== "question") return;
    timerRef.current = setTimeout(() => answer(null), timeLimitSec * 1000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, idx, timeLimitSec, answer]);

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
            {mode === "trial" && (
              <div>
                <b>{maxCombo}</b>
                <small>最高连击</small>
              </div>
            )}
            {mode === "lesson" && (
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
              {Array.from({ length: TRIAL_HEARTS }, (_, i) => (
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
        <i style={{ animationDuration: `${timeLimitSec}s` }} />
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
        {phase === "feedback" && selected === null && (
          <p className="quiz-timeout">时间到！</p>
        )}
      </main>
    </div>
  );
}
