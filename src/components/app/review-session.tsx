"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Flame, RotateCcw, X, Zap } from "lucide-react";
import { celebrate } from "@/lib/celebrate";
import {
  gradeReviewCard,
  settleReviewDay,
  type ReviewCardView,
  type ReviewSettleResult,
} from "@/lib/game/review-actions";
import { rewardToast } from "@/lib/reward-feedback";

// 今日复习会话(间隔重复的「测试效应」执行层):
// 逐卡四选一,答错立刻看到正确答案 + 出处集链接(错了马上重学);
// 没有红心没有倒计时——复习是巩固不是考试,压力感只会赶人走。
// 快答(5 秒内)有 ease 加成:答得快说明记得牢,间隔可以拉更长。

const FAST_MS = 5000;

/** 快答判定(独立函数,只在点击回调里调用) */
function isFastAnswer(startedAt: number): boolean {
  return startedAt > 0 && performance.now() - startedAt < FAST_MS;
}

export function ReviewSession({ cards }: { cards: ReviewCardView[] }) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"asking" | "feedback" | "result">(
    cards.length === 0 ? "result" : "asking",
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [nextInterval, setNextInterval] = useState<number | null>(null);
  const [settle, setSettle] = useState<ReviewSettleResult | null>(null);
  const askedAt = useRef(0);

  const card = cards[idx];

  // 第一张卡的计时起点(之后每张在 next() 里重置)
  useEffect(() => {
    askedAt.current = performance.now();
  }, []);

  const finish = async () => {
    setPhase("result");
    const r = await settleReviewDay();
    setSettle(r);
    if (r.ok && r.gained > 0) {
      rewardToast({ text: `+${r.gained} XP · 今日复习完成`, tone: "review" });
      if (r.streak > 1) {
        rewardToast({ text: `🔥 连续学习 ${r.streak} 天`, tone: "streak" });
      }
      celebrate({
        kind: "quest",
        title: "今日复习完成！",
        subtitle: `${cards.length} 张卡片 · 记忆曲线已续上`,
      });
      if (r.levelUp) {
        celebrate({
          kind: "level",
          title: `升至 Lv.${r.newLevel}`,
          subtitle: "继续保持",
        });
      }
    }
  };

  const answer = (i: number) => {
    if (!card || phase !== "asking") return;
    const correct = i === card.question.answerIndex;
    const fast = isFastAnswer(askedAt.current);
    setSelected(i);
    setPhase("feedback");
    if (correct) setCorrectCount((n) => n + 1);
    void gradeReviewCard(card.cardId, correct, correct && fast).then((r) => {
      if (r.ok) setNextInterval(r.nextIntervalDays ?? null);
    });
  };

  const next = () => {
    setSelected(null);
    setNextInterval(null);
    askedAt.current = performance.now();
    if (idx + 1 >= cards.length) {
      void finish();
    } else {
      setIdx(idx + 1);
      setPhase("asking");
    }
  };

  if (phase === "result") {
    return (
      <div className="quiz-root">
        <div className="quiz-result">
          <span className="quiz-result-icon pass" aria-hidden>
            {cards.length === 0 ? <RotateCcw size={44} /> : <Zap size={44} strokeWidth={2.2} />}
          </span>
          <h1>{cards.length === 0 ? "今天没有到期的卡" : "今日复习完成！"}</h1>
          {cards.length > 0 && (
            <div className="quiz-result-stats">
              <div>
                <b>
                  {correctCount}/{cards.length}
                </b>
                <small>答对</small>
              </div>
              {settle && settle.streak > 0 && (
                <div>
                  <b>
                    <Flame size={18} className="inline" aria-hidden />
                    {settle.streak}
                  </b>
                  <small>连胜</small>
                </div>
              )}
            </div>
          )}
          <p className="quiz-result-note">
            {cards.length === 0
              ? "看完新的一集,明天这里就会长出复习卡。"
              : settle == null
                ? "结算中…"
                : settle.gained > 0
                  ? `+${settle.gained} XP${settle.levelUp ? ` · 升到 ${settle.newLevel} 级！` : ""}`
                  : "今天的复习奖励已领过,这轮算加练。"}
          </p>
          <div className="quiz-result-actions">
            <button
              className="app-btn-primary"
              onClick={() => router.push("/play")}
            >
              回到地图
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!card) return null;
  const q = card.question;

  return (
    <div className="quiz-root">
      <header className="quiz-head">
        <button
          className="quiz-close"
          onClick={() => router.push("/play")}
          aria-label="退出"
        >
          <X size={26} />
        </button>
        <div className="quiz-progress">
          <i style={{ width: `${(idx / cards.length) * 100}%` }} aria-hidden />
        </div>
        <span className="review-count">
          {idx + 1}/{cards.length}
        </span>
      </header>

      <main className="quiz-body">
        <p className="quiz-kind">
          {q.kind === "term" ? "还记得这个术语吗?" : "这个知识点讲的是?"}
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
        <div className="quiz-underline review-underline">
          {phase === "feedback" && (
            <>
              <p className="review-next-note">
                {selected === q.answerIndex
                  ? nextInterval
                    ? `记住了!${nextInterval} 天后再见`
                    : "记住了!"
                  : "忘了没关系,明天再来一次"}
                {" · "}
                <Link
                  href={`/courses/${card.courseId}?ep=${card.episodeN}`}
                  className="review-source"
                >
                  回看 第 {card.episodeN} 集
                </Link>
              </p>
              <button className="app-btn-primary review-next" onClick={next}>
                {idx + 1 >= cards.length ? "完成复习" : "下一张"}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
