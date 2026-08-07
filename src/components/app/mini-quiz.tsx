"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import type { QuizQuestion } from "@/lib/game/quiz-draw";
import {
  getEpisodeQuiz,
  submitEpisodeQuiz,
  type QuizSettleResult,
} from "@/lib/game/quiz-actions";
import { celebrate } from "@/lib/celebrate";
import { rewardToast } from "@/lib/reward-feedback";

// 分集小测验（自愿版）：看完一集后点「小测验」展开的一张内联卡片。
// 不占全屏、不打断——它不在通关强制路径上（列表的返回判定只看观看状态），
// 纯粹给主动复习的人一点额外 XP。逐题四选一，答完发一小笔奖励。

const FEEDBACK_MS = 900;
// 单题快答窗口：8 秒内答对算「快答」，多给 1 底分
const FAST_MS = 8000;

interface Props {
  courseId: string;
  epN: number;
  color: string;
  onClose: () => void;
}

export function MiniQuiz({ courseId, epN, color, onClose }: Props) {
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [phase, setPhase] = useState<"question" | "feedback" | "result">(
    "question",
  );
  const [correct, setCorrect] = useState(0);
  const [fast, setFast] = useState(0);
  const [settle, setSettle] = useState<QuizSettleResult | null>(null);
  const startRef = useRef(0);
  const settledRef = useRef(false);

  useEffect(() => {
    let alive = true;
    getEpisodeQuiz(courseId, epN).then((r) => {
      if (!alive) return;
      if (!r.ok || !r.questions?.length) {
        setError(r.error ?? "这一集暂时没有题");
        return;
      }
      setQuestions(r.questions);
      startRef.current = performance.now();
    });
    return () => {
      alive = false;
    };
  }, [courseId, epN]);

  const finish = useCallback(
    async (finalCorrect: number, finalFast: number, total: number) => {
      setPhase("result");
      if (settledRef.current) return;
      settledRef.current = true;
      const r = await submitEpisodeQuiz(
        courseId,
        epN,
        finalCorrect,
        total,
        finalFast,
      );
      setSettle(r);
      if (r.ok && r.passed && r.gained) {
        rewardToast({ text: `小测验 +${r.gained} XP`, tone: "xp" });
        if (r.levelUp) {
          celebrate({
            kind: "level",
            title: `升至 Lv.${r.newLevel}`,
            subtitle: "继续保持",
          });
        }
      }
    },
    [courseId, epN],
  );

  const answer = useCallback(
    (i: number) => {
      if (phase !== "question" || !questions) return;
      const q = questions[idx];
      const wasCorrect = i === q.answerIndex;
      const wasFast =
        wasCorrect && performance.now() - startRef.current <= FAST_MS;
      setSelected(i);
      setPhase("feedback");
      const nextCorrect = correct + (wasCorrect ? 1 : 0);
      const nextFast = fast + (wasFast ? 1 : 0);
      if (wasCorrect) setCorrect(nextCorrect);
      if (wasFast) setFast(nextFast);
      setTimeout(() => {
        const next = idx + 1;
        if (next >= questions.length) {
          finish(nextCorrect, nextFast, questions.length);
          return;
        }
        setIdx(next);
        setSelected(null);
        setPhase("question");
        startRef.current = performance.now();
      }, FEEDBACK_MS);
    },
    [phase, questions, idx, correct, fast, finish],
  );

  if (error) {
    return (
      <div className="mini-quiz">
        <div className="mini-quiz-head">
          <span className="mini-quiz-title">小测验</span>
          <button className="mini-quiz-close" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <p className="mini-quiz-empty">{error}</p>
      </div>
    );
  }

  if (!questions) {
    return (
      <div className="mini-quiz">
        <p className="mini-quiz-empty">出题中…</p>
      </div>
    );
  }

  if (phase === "result") {
    const passed = correct / questions.length >= 0.6;
    return (
      <div className="mini-quiz">
        <div className="mini-quiz-head">
          <span className="mini-quiz-title">
            <Sparkles size={15} aria-hidden /> 小测验完成
          </span>
          <button className="mini-quiz-close" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <p className="mini-quiz-result">
          答对 {correct}/{questions.length}
          {settle == null
            ? " · 结算中…"
            : passed
              ? settle.gained
                ? ` · +${settle.gained} XP`
                : " · 已测过（奖励首次已发）"
              : " · 答对 60% 才有奖励"}
        </p>
        <button className="app-btn-plain mini-quiz-done" onClick={onClose}>
          收起
        </button>
      </div>
    );
  }

  const q = questions[idx];
  return (
    <div className="mini-quiz">
      <div className="mini-quiz-head">
        <span className="mini-quiz-title">
          小测验 · {idx + 1}/{questions.length}
        </span>
        <button className="mini-quiz-close" onClick={onClose} aria-label="关闭">
          <X size={16} />
        </button>
      </div>
      <p className="mini-quiz-prompt">{q.prompt}</p>
      <div className="mini-quiz-options">
        {q.options.map((opt, i) => {
          let cls = "mini-quiz-option";
          if (phase === "feedback") {
            if (i === q.answerIndex) cls += " right";
            else if (i === selected) cls += " wrong";
            else cls += " dim";
          }
          return (
            <button
              key={i}
              className={cls}
              style={
                phase === "feedback" && i === q.answerIndex
                  ? { borderColor: color }
                  : undefined
              }
              disabled={phase === "feedback"}
              onClick={() => answer(i)}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
