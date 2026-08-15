"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, X } from "lucide-react";
import type { QuizQuestion } from "@/lib/game/quiz-draw";
import {
  submitPlacement,
  type PlacementResult,
} from "@/lib/game/placement-actions";
import { recordMistakes } from "@/lib/game/mistakes-actions";
import type { MistakeItem } from "@/lib/game/mistakes";
import { celebrate } from "@/lib/celebrate";
import { rewardToast } from "@/lib/reward-feedback";

// 分级测:对一条路线连续出题,从头连续答对的课直接跳过,落在第一门没过的课。
// 无生命无计时;逐题记录选择,交卷服务端按 seed 核对。答错的题也进错题本。

const FEEDBACK_MS = 850;

export function PlacementExam({
  roadmapId,
  roadmapTitle,
  seed,
  questions,
  questionCourse,
}: {
  roadmapId: string;
  roadmapTitle: string;
  seed: number;
  questions: QuizQuestion[];
  /** 与 questions 等长:每题来自哪门课的标题 */
  questionCourse: string[];
}) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"question" | "feedback" | "result">(
    "question",
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<PlacementResult | null>(null);
  const wrongRef = useRef<MistakeItem[]>([]);

  const q = questions[idx];

  const answer = (i: number) => {
    if (phase !== "question") return;
    const next = [...answers, i];
    if (i !== q.answerIndex) {
      wrongRef.current.push({
        courseId: q.courseId,
        epN: q.epN,
        kind: q.kind,
        prompt: q.prompt,
        answer: q.options[q.answerIndex],
      });
    }
    setSelected(i);
    setAnswers(next);
    setPhase("feedback");
    setTimeout(() => {
      if (idx + 1 >= questions.length) void finish(next);
      else {
        setIdx(idx + 1);
        setSelected(null);
        setPhase("question");
      }
    }, FEEDBACK_MS);
  };

  const finish = async (finalAnswers: number[]) => {
    setPhase("result");
    if (wrongRef.current.length > 0) void recordMistakes(wrongRef.current);
    const r = await submitPlacement(roadmapId, seed, finalAnswers);
    setResult(r);
    if (r.ok && (r.skippedCount ?? 0) > 0) {
      if (r.gained) rewardToast({ text: `+${r.gained} XP`, tone: "xp" });
      if (r.coins) rewardToast({ text: `+${r.coins} 金币`, tone: "coin" });
      celebrate({
        kind: "boss",
        title: "分级测通过！",
        subtitle: `直接跳过了 ${r.skippedCount} 门课`,
      });
    }
  };

  if (phase === "result") {
    const skipped = result?.skippedCount ?? 0;
    return (
      <div className="quiz-root">
        <div className="quiz-result">
          <span
            className={`quiz-result-icon ${skipped > 0 ? "pass" : "fail"}`}
            aria-hidden
          >
            {skipped > 0 ? (
              <GraduationCap size={44} strokeWidth={2.2} />
            ) : (
              <X size={44} />
            )}
          </span>
          <h1>{skipped > 0 ? "分级测完成" : "从头开始更稳"}</h1>
          {result == null ? (
            <p className="quiz-result-note">结算中…</p>
          ) : skipped > 0 ? (
            <>
              <div className="quiz-result-stats">
                <div>
                  <b>{skipped}</b>
                  <small>直接跳过</small>
                </div>
                <div>
                  <b>{result.totalTested}</b>
                  <small>共测</small>
                </div>
              </div>
              <p className="quiz-result-note">
                已掌握 {result.skippedTitles?.join("、")}。
                {result.allPassed
                  ? "这条线能测的都过了,去挑战更深的吧。"
                  : `直接从《${result.placedInto}》开始学。`}
                {result.gained
                  ? ` · +${result.gained} XP · +${result.coins} 金币`
                  : ""}
              </p>
            </>
          ) : (
            <p className="quiz-result-note">
              第一门就没到 70%,从头学更扎实。别急,慢慢来。
            </p>
          )}
          <div className="quiz-result-actions">
            <button
              className="app-btn-primary"
              onClick={() => router.push(`/roadmaps/${roadmapId}`)}
            >
              回到路线
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
        <button
          className="quiz-close"
          onClick={() => router.push(`/roadmaps/${roadmapId}`)}
          aria-label="退出"
        >
          <X size={26} />
        </button>
        <div className="quiz-progress">
          <i
            style={{ width: `${(idx / questions.length) * 100}%` }}
            aria-hidden
          />
        </div>
        <span className="exam-count" aria-hidden>
          {idx + 1}/{questions.length}
        </span>
      </header>
      <main className="quiz-body">
        <p className="quiz-kind">
          分级测 · {roadmapTitle} · 来自《{questionCourse[idx]}》
        </p>
        <p className="quiz-kind">
          {q.kind === "term"
            ? "这个术语是什么意思？"
            : "关于这个知识点，哪个说法对？"}
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
      </main>
    </div>
  );
}
