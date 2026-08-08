"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Flame, RotateCcw, X, Zap } from "lucide-react";
import { celebrate } from "@/lib/celebrate";
import {
  gradeReviewCard,
  settleReviewDay,
  type GradeResult,
  type ReviewCardView,
  type ReviewSettleResult,
} from "@/lib/game/review-actions";
import { rewardToast } from "@/lib/reward-feedback";

// 今日复习会话(间隔重复的「测试效应」执行层):
// 逐卡答题,答错立刻看到正确答案 + 出处集链接(错了马上重学);
// 没有红心没有倒计时——复习是巩固不是考试,压力感只会赶人走。
// 判分在服务端(不信客户端),答对才给 XP;熟练的短术语卡升级成填空(主动回忆)。

const FAST_MS = 5000;

function isFastAnswer(startedAt: number): boolean {
  return startedAt > 0 && performance.now() - startedAt < FAST_MS;
}

export function ReviewSession({ cards }: { cards: ReviewCardView[] }) {
  const router = useRouter();
  // 结算后 settleReviewDay 会 revalidate,cards prop 可能被刷成空——
  // 用挂载时的张数记住这次会话的规模,别让结算屏塌成「没有到期的卡」空态
  const [sessionTotal] = useState(cards.length);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"asking" | "feedback" | "result">(
    cards.length === 0 ? "result" : "asking",
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [fillText, setFillText] = useState("");
  const [graded, setGraded] = useState<GradeResult | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [settle, setSettle] = useState<ReviewSettleResult | null>(null);
  const askedAt = useRef(0);

  const card = cards[idx];

  useEffect(() => {
    askedAt.current = performance.now();
  }, []);

  const finish = async () => {
    setPhase("result");
    const r = await settleReviewDay();
    setSettle(r);
    if (r.ok && r.gained > 0) {
      rewardToast({ text: `+${r.gained} XP · 今日复习完成`, tone: "review" });
      if (r.coins > 0) {
        rewardToast({ text: `+${r.coins} 金币 · 正确率奖励`, tone: "coin" });
      }
      if (r.streak > 1) {
        rewardToast({ text: `🔥 连续学习 ${r.streak} 天`, tone: "streak" });
      }
      celebrate({
        kind: "quest",
        title: "今日复习完成！",
        subtitle: `正确率 ${Math.round(r.accuracy * 100)}% · 记忆曲线已续上`,
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

  // 提交作答(mcq 传下标 / fill 传文本),服务端判分回来再显示反馈
  const submit = (submission: { mode: "mcq"; index: number } | { mode: "fill"; text: string }) => {
    if (!card || phase !== "asking") return;
    const fast = isFastAnswer(askedAt.current);
    if (submission.mode === "mcq") setSelected(submission.index);
    setPhase("feedback");
    void gradeReviewCard(card.cardId, { ...submission, fast }).then((r) => {
      setGraded(r);
      if (r.ok && r.correct) setCorrectCount((n) => n + 1);
    });
  };

  const next = () => {
    setSelected(null);
    setFillText("");
    setGraded(null);
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
            {sessionTotal === 0 ? <RotateCcw size={44} /> : <Zap size={44} strokeWidth={2.2} />}
          </span>
          <h1>{sessionTotal === 0 ? "今天没有到期的卡" : "今日复习完成！"}</h1>
          {sessionTotal > 0 && (
            <div className="quiz-result-stats">
              <div>
                <b>
                  {correctCount}/{sessionTotal}
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
            {sessionTotal === 0
              ? "看完新的一集,明天这里就会长出复习卡。"
              : settle == null
                ? "结算中…"
                : settle.gained > 0
                  ? `+${settle.gained} XP${settle.coins > 0 ? ` · +${settle.coins} 金币` : ""}${settle.levelUp ? ` · 升到 ${settle.newLevel} 级！` : ""}`
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
  const isFill = q.mode === "fill";

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
          {card.courseTitle && (
            <span className="quiz-source-tag">
              {card.courseTitle} · 第 {card.episodeN} 集
            </span>
          )}
          {isFill
            ? "看定义,打出这个术语(主动回忆)"
            : q.kind === "term"
              ? "还记得这个术语吗?"
              : "这个知识点讲的是?"}
        </p>
        <h1 className="quiz-prompt">{q.prompt}</h1>

        {isFill ? (
          <form
            className="review-fill"
            onSubmit={(e) => {
              e.preventDefault();
              if (phase === "asking" && fillText.trim()) {
                submit({ mode: "fill", text: fillText });
              }
            }}
          >
            <input
              className="review-fill-input"
              value={fillText}
              onChange={(e) => setFillText(e.target.value)}
              disabled={phase === "feedback"}
              placeholder="打出你记得的术语…"
              autoFocus
              autoComplete="off"
            />
            {phase === "asking" && (
              <button
                type="submit"
                className="app-btn-primary"
                disabled={!fillText.trim()}
              >
                提交
              </button>
            )}
          </form>
        ) : (
          <div className="quiz-options">
            {(q.options ?? []).map((opt, i) => {
              let cls = "quiz-option";
              if (phase === "feedback" && graded) {
                if (i === graded.correctIndex) cls += " right";
                else if (i === selected) cls += " wrong";
                else cls += " dim";
              }
              return (
                <button
                  key={i}
                  className={cls}
                  disabled={phase === "feedback"}
                  onClick={() => submit({ mode: "mcq", index: i })}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        )}

        <div className="quiz-underline review-underline">
          {phase === "feedback" && graded && (
            <>
              <p className="review-next-note">
                {graded.correct
                  ? graded.nextIntervalDays
                    ? `记住了!${graded.nextIntervalDays} 天后再见`
                    : "记住了!"
                  : `正确答案:${graded.correctText}`}
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
