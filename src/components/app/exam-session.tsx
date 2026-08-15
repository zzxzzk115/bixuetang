"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, X, Zap } from "lucide-react";
import type { QuizQuestion } from "@/lib/game/quiz-draw";
import {
  submitCourseExam,
  type ExamResult,
} from "@/lib/game/course-exam-actions";
import { recordMistakes } from "@/lib/game/mistakes-actions";
import type { MistakeItem } from "@/lib/game/mistakes";
import { celebrate } from "@/lib/celebrate";
import { rewardToast } from "@/lib/reward-feedback";

// 跳级考:整门课的综合测验。答对 ≥70% 即跳过本课(全集记为已学、解锁下一门、
// 发一次性固定奖励)。无生命、无计时——是「证明掌握」的考卷,不是竞速。
// 逐题记录选择,交卷时服务端按 seed 复现核对(不信客户端分数)。

const FEEDBACK_MS = 900;
const PASS_RATIO = 0.7;

export function ExamSession({
  courseId,
  courseTitle,
  seed,
  questions,
}: {
  courseId: string;
  courseTitle: string;
  seed: number;
  questions: QuizQuestion[];
}) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"question" | "feedback" | "result">(
    "question",
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [correct, setCorrect] = useState(0);
  const [result, setResult] = useState<ExamResult | null>(null);
  const wrongRef = useRef<MistakeItem[]>([]);

  const q = questions[idx];
  const passLine = Math.ceil(questions.length * PASS_RATIO);

  const answer = (i: number) => {
    if (phase !== "question") return;
    const nextAnswers = [...answers, i];
    const wasCorrect = i === q.answerIndex;
    if (!wasCorrect) {
      wrongRef.current.push({
        courseId: q.courseId,
        epN: q.epN,
        kind: q.kind,
        prompt: q.prompt,
        answer: q.options[q.answerIndex],
      });
    }
    setSelected(i);
    setAnswers(nextAnswers);
    if (wasCorrect) setCorrect((c) => c + 1);
    setPhase("feedback");
    setTimeout(() => {
      const next = idx + 1;
      if (next >= questions.length) {
        void finish(nextAnswers);
      } else {
        setIdx(next);
        setSelected(null);
        setPhase("question");
      }
    }, FEEDBACK_MS);
  };

  const finish = async (finalAnswers: number[]) => {
    setPhase("result");
    if (wrongRef.current.length > 0) void recordMistakes(wrongRef.current);
    const r = await submitCourseExam(courseId, seed, finalAnswers);
    setResult(r);
    if (r.ok && r.passed && r.skipped) {
      if (r.gained) rewardToast({ text: `+${r.gained} XP`, tone: "xp" });
      if (r.coins) rewardToast({ text: `+${r.coins} 金币`, tone: "coin" });
      celebrate({
        kind: "boss",
        title: "跳级成功！",
        subtitle: `《${courseTitle}》已记为学完,下一门已解锁`,
      });
    }
  };

  if (phase === "result") {
    // 通过与否本地即可判定(与服务端同一条 70% 线),不等结算返回
    const passed = correct >= passLine;
    return (
      <div className="quiz-root">
        <div className="quiz-result">
          <span
            className={`quiz-result-icon ${passed ? "pass" : "fail"}`}
            aria-hidden
          >
            {passed ? <GraduationCap size={44} strokeWidth={2.2} /> : <X size={44} />}
          </span>
          <h1>{passed ? "跳级成功！" : "还差一点"}</h1>
          <div className="quiz-result-stats">
            <div>
              <b>{correct}</b>
              <small>答对</small>
            </div>
            <div>
              <b>
                {correct}/{questions.length}
              </b>
              <small>正确率</small>
            </div>
          </div>
          {result == null ? (
            <p className="quiz-result-note">结算中…</p>
          ) : !passed ? (
            <p className="quiz-result-note">
              答对 {passLine}/{questions.length}（70%）才能跳级,再学学回来挑战!
            </p>
          ) : result.alreadyDone ? (
            <p className="quiz-result-note">这门课之前已跳过,奖励已发过</p>
          ) : (
            <p className="quiz-result-note">
              《{courseTitle}》记为学完 · +{result.gained} XP · +{result.coins} 金币
              {result.levelUp ? ` · 升到 ${result.newLevel} 级！` : ""}
            </p>
          )}
          <div className="quiz-result-actions">
            {!passed && (
              <button
                className="app-btn-primary"
                onClick={() => router.refresh()}
              >
                重新挑战
              </button>
            )}
            <button
              className={passed ? "app-btn-primary" : "app-btn-plain"}
              onClick={() => {
                router.push(passed ? "/play" : `/courses/${courseId}`);
              }}
            >
              {passed ? "回到地图" : "回课程页"}
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
          onClick={() => router.push(`/courses/${courseId}`)}
          aria-label="退出"
        >
          <X size={26} />
        </button>
        <div className="quiz-progress">
          <i style={{ width: `${(idx / questions.length) * 100}%` }} aria-hidden />
        </div>
        <span className="exam-count" aria-hidden>
          {idx + 1}/{questions.length}
        </span>
      </header>

      <main className="quiz-body">
        <p className="quiz-kind">
          <Zap size={14} aria-hidden /> 跳级考 · 答对 {passLine} 题即过
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
