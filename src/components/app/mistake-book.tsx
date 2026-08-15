"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookX, Check, RotateCcw, X } from "lucide-react";
import type { DrillCard, MistakeRow } from "@/lib/game/mistakes";
import { resolveMistake } from "@/lib/game/mistakes-actions";

// 错题本:上半是清单(题面 + 正解 + 出处 + 错几次),点「重刷」进入逐题练习;
// 答对当场从错题本清除(服务端按 seed 核对答案再删),答错保留。

const FEEDBACK_MS = 950;

export function MistakeBook({
  list,
  drill,
  seed,
}: {
  list: MistakeRow[];
  drill: DrillCard[];
  seed: number;
}) {
  const [drilling, setDrilling] = useState(false);

  if (list.length === 0) {
    return (
      <div className="app-page">
        <header className="app-page-head">
          <h1>错题本</h1>
        </header>
        <div className="course-card mistake-empty">
          <BookX size={40} aria-hidden />
          <p>还没有错题。测验、试炼、跳级考里答错的题会自动收进这里,方便你重刷。</p>
          <Link className="app-btn-primary" href="/play/trial">
            去练一场
          </Link>
        </div>
      </div>
    );
  }

  if (drilling) {
    return <Drill cards={drill} seed={seed} onDone={() => setDrilling(false)} />;
  }

  return (
    <div className="app-page">
      <header className="app-page-head">
        <h1>错题本 · {list.length}</h1>
        <p className="me-note">答错的题都在这。重刷答对就从本子上划掉。</p>
      </header>

      {drill.length > 0 && (
        <button
          className="app-btn-primary mistake-drill-start"
          onClick={() => setDrilling(true)}
        >
          <RotateCcw size={16} aria-hidden /> 开始重刷 {drill.length} 道
        </button>
      )}

      <ul className="mistake-list">
        {list.map((m) => (
          <li key={m.id} className="mistake-item">
            <div className="mistake-body">
              <b>{m.prompt}</b>
              <small className="mistake-answer">正解:{m.answer}</small>
              <small className="mistake-meta">
                {m.courseTitle}
                {m.timesWrong > 1 ? ` · 错过 ${m.timesWrong} 次` : ""}
              </small>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Drill({
  cards,
  seed,
  onDone,
}: {
  cards: DrillCard[];
  seed: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"question" | "feedback" | "result">(
    "question",
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [cleared, setCleared] = useState(0);
  const [missed, setMissed] = useState(0);

  const card = cards[idx];

  const answer = (i: number) => {
    if (phase !== "question") return;
    const wasCorrect = i === card.question.answerIndex;
    setSelected(i);
    setPhase("feedback");
    if (wasCorrect) {
      setCleared((c) => c + 1);
      void resolveMistake(card.mistakeId, seed, i);
    } else {
      setMissed((m) => m + 1);
    }
    setTimeout(() => {
      const next = idx + 1;
      if (next >= cards.length) {
        setPhase("result");
      } else {
        setIdx(next);
        setSelected(null);
        setPhase("question");
      }
    }, FEEDBACK_MS);
  };

  if (phase === "result") {
    return (
      <div className="quiz-root">
        <div className="quiz-result">
          <span className="quiz-result-icon pass" aria-hidden>
            <Check size={44} strokeWidth={2.2} />
          </span>
          <h1>重刷完成</h1>
          <div className="quiz-result-stats">
            <div>
              <b>{cleared}</b>
              <small>已划掉</small>
            </div>
            <div>
              <b>{missed}</b>
              <small>还要练</small>
            </div>
          </div>
          <p className="quiz-result-note">
            {missed === 0
              ? "全清了,漂亮!"
              : `还有 ${missed} 道没答对,留在本子上下次再来。`}
          </p>
          <div className="quiz-result-actions">
            <button
              className="app-btn-primary"
              onClick={() => {
                onDone();
                router.refresh();
              }}
            >
              回到错题本
            </button>
          </div>
        </div>
      </div>
    );
  }

  const q = card.question;
  return (
    <div className="quiz-root">
      <header className="quiz-head">
        <button className="quiz-close" onClick={onDone} aria-label="退出">
          <X size={26} />
        </button>
        <div className="quiz-progress">
          <i style={{ width: `${(idx / cards.length) * 100}%` }} aria-hidden />
        </div>
        <span className="exam-count" aria-hidden>
          {idx + 1}/{cards.length}
        </span>
      </header>
      <main className="quiz-body">
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
