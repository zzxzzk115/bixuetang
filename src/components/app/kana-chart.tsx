"use client";

import { useCallback, useState } from "react";
import { Check, Volume2 } from "lucide-react";
import { celebrate } from "@/lib/celebrate";
import { completeKanaQuiz } from "@/lib/game/kana-actions";
import {
  ALL_KANA,
  KANA_QUIZ_LEN,
  KANA_ROWS,
  type Kana,
  type KanaScript,
  SCRIPT_LABEL,
} from "@/lib/game/kana-data";
import { rewardToast } from "@/lib/reward-feedback";

// 五十音图交互:点假名听发音(浏览器 ja-JP TTS,罗马音始终显示作兜底);
// 测验模式给假名选罗马音,通关一套得一次 XP。纯前端 + 一个幂等 XP action。

function glyph(kana: Kana, script: KanaScript): string {
  return script === "hira" ? kana.hira : kana.kata;
}

function jaVoice(): SpeechSynthesisVoice | undefined {
  if (typeof window === "undefined" || !window.speechSynthesis) return undefined;
  return window.speechSynthesis.getVoices().find((v) => /^ja/i.test(v.lang));
}

/** 用浏览器语音朗读假名;没有日语语音时静默(界面已有罗马音兜底) */
function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const synth = window.speechSynthesis;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  u.rate = 0.85;
  const v = jaVoice();
  if (v) u.voice = v;
  // 只在正在朗读时打断——无条件 cancel() 在部分浏览器会连新念的也一起取消
  if (synth.speaking || synth.pending) synth.cancel();
  synth.speak(u);
}

/** 发音:优先播打包音频(任何设备都响),失败再退回浏览器 TTS(需系统日语语音) */
function playKana(kana: Kana) {
  if (typeof window === "undefined") return;
  const audio = new Audio(`/kana/${kana.romaji}.mp3`);
  audio.play().catch(() => speak(kana.hira));
}

interface Question {
  kana: Kana;
  options: string[];
}

function buildQuiz(script: KanaScript): Question[] {
  // 随机抽 KANA_QUIZ_LEN 个不重复假名,每题 4 选 1(罗马音)
  const pool = [...ALL_KANA];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picks = pool.slice(0, KANA_QUIZ_LEN);
  return picks.map((kana) => {
    const distractors = ALL_KANA.filter((x) => x.romaji !== kana.romaji);
    for (let i = distractors.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [distractors[i], distractors[j]] = [distractors[j], distractors[i]];
    }
    const options = [kana.romaji, ...distractors.slice(0, 3).map((d) => d.romaji)];
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    // glyph 参数在渲染时决定,这里只存假名
    void script;
    return { kana, options };
  });
}

export function KanaChart() {
  const [script, setScript] = useState<KanaScript>("hira");
  const [mode, setMode] = useState<"chart" | "quiz">("chart");
  const [active, setActive] = useState<string | null>(null);

  // 测验状态
  const [quiz, setQuiz] = useState<Question[]>([]);
  const [qi, setQi] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [finished, setFinished] = useState<{ gained: number } | null>(null);

  const startQuiz = useCallback(() => {
    setQuiz(buildQuiz(script));
    setQi(0);
    setCorrect(0);
    setPicked(null);
    setFinished(null);
    setMode("quiz");
  }, [script]);

  function tapKana(kana: Kana) {
    setActive(kana.romaji);
    playKana(kana);
  }

  function answer(opt: string) {
    if (picked) return; // 已选,等下一题
    const cur = quiz[qi];
    const right = opt === cur.kana.romaji;
    setPicked(opt);
    playKana(cur.kana);
    const nextCorrect = correct + (right ? 1 : 0);
    setTimeout(async () => {
      if (qi + 1 < quiz.length) {
        setCorrect(nextCorrect);
        setQi(qi + 1);
        setPicked(null);
      } else {
        // 全对才算通关得分
        setCorrect(nextCorrect);
        if (nextCorrect === quiz.length) {
          const r = await completeKanaQuiz(script);
          setFinished({ gained: r.gained });
          if (r.gained > 0) {
            rewardToast({ text: `${SCRIPT_LABEL[script]}通关 +${r.gained} XP`, tone: "xp" });
            celebrate({ kind: "quest", title: `${SCRIPT_LABEL[script]}全对!`, subtitle: "假名认全了,继续练片假名 / 进日语课" });
          } else {
            rewardToast({ text: "已掌握过这套,再练不额外给分" });
          }
        } else {
          setFinished({ gained: 0 });
        }
      }
    }, 650);
  }

  return (
    <div className="kana">
      <div className="kana-tabs">
        <div className="kana-scripts">
          {(["hira", "kata"] as KanaScript[]).map((s) => (
            <button
              key={s}
              type="button"
              className={`kana-tab${script === s ? " on" : ""}`}
              onClick={() => {
                setScript(s);
                setMode("chart");
              }}
            >
              {SCRIPT_LABEL[s]}
            </button>
          ))}
        </div>
        {mode === "chart" ? (
          <button type="button" className="kana-quiz-start" onClick={startQuiz}>
            开始测验 →
          </button>
        ) : (
          <button
            type="button"
            className="app-btn-plain"
            onClick={() => setMode("chart")}
          >
            返回图表
          </button>
        )}
      </div>

      {mode === "chart" ? (
        <>
          <p className="kana-hint">
            <Volume2 size={14} aria-hidden /> 点任意假名听发音;下方是罗马音。
          </p>
          <div className="kana-grid">
            {KANA_ROWS.map((row) => (
              <div className="kana-row" key={row.key}>
                {row.cells.map((cell, i) =>
                  cell ? (
                    <button
                      key={i}
                      type="button"
                      className={`kana-cell${active === cell.romaji ? " on" : ""}`}
                      onClick={() => tapKana(cell)}
                    >
                      <b>{glyph(cell, script)}</b>
                      <small>{cell.romaji}</small>
                    </button>
                  ) : (
                    <span key={i} className="kana-cell kana-cell-empty" />
                  ),
                )}
              </div>
            ))}
          </div>
        </>
      ) : finished ? (
        <div className="kana-result">
          <b>
            {correct}/{quiz.length} 正确
          </b>
          {finished.gained > 0 ? (
            <p className="kana-result-ok">
              <Check size={16} aria-hidden /> 通关 +{finished.gained} XP
            </p>
          ) : correct === quiz.length ? (
            <p className="me-note">已掌握过这套,再练不额外给分。</p>
          ) : (
            <p className="me-note">全对才通关,再来一次?</p>
          )}
          <div className="kana-result-actions">
            <button type="button" className="app-btn-primary" onClick={startQuiz}>
              再测一次
            </button>
            <button
              type="button"
              className="app-btn-plain"
              onClick={() => setMode("chart")}
            >
              回图表
            </button>
          </div>
        </div>
      ) : quiz.length > 0 ? (
        <div className="kana-quiz">
          <div className="kana-quiz-progress">
            第 {qi + 1}/{quiz.length} 题 · 已对 {correct}
          </div>
          <button
            type="button"
            className="kana-quiz-glyph"
            onClick={() => playKana(quiz[qi].kana)}
            title="听发音"
          >
            {glyph(quiz[qi].kana, script)}
            <Volume2 size={16} aria-hidden />
          </button>
          <div className="kana-quiz-options">
            {quiz[qi].options.map((opt) => {
              const isRight = opt === quiz[qi].kana.romaji;
              const cls = picked
                ? isRight
                  ? " right"
                  : opt === picked
                    ? " wrong"
                    : ""
                : "";
              return (
                <button
                  key={opt}
                  type="button"
                  className={`kana-opt${cls}`}
                  disabled={!!picked}
                  onClick={() => answer(opt)}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
