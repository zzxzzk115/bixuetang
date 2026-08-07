"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Mic, Play, Square } from "lucide-react";
import type { ShadowSentence } from "@/lib/content/schema";
import { scoreShadow, type ShadowScore } from "@/lib/shadow/score";

// 影子跟读练习壳(纯前端):
//   音源 = B 站(复用 /api/bili/play 的 DASH,隐藏 video + dash.js)
//   单句 A-B 循环 + 保音调变速;录音 = getUserMedia + MediaRecorder
//   原声/录音双波形 canvas;打分 = @/lib/shadow/score(Meyda+pitchfinder+DTW)
// 五步闭环:盲听 → 精听(看文) → 影子跟读(不看文) → 录音对比 → 脱稿复述。

const STEPS = ["盲听", "精听", "跟读", "录音对比", "复述"] as const;
const RATES = [0.6, 0.8, 1] as const;

interface PlayPayload {
  dash?: { mpd: string } | null;
  error?: string;
}

/** 把音频缓冲画成峰值波形 */
function drawWave(canvas: HTMLCanvasElement | null, pcm: Float32Array | null, color: string) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  if (!pcm || pcm.length === 0) return;
  const step = Math.max(1, Math.floor(pcm.length / w));
  ctx.fillStyle = color;
  for (let x = 0; x < w; x++) {
    let peak = 0;
    for (let i = 0; i < step; i++) {
      const v = Math.abs(pcm[x * step + i] ?? 0);
      if (v > peak) peak = v;
    }
    const bar = Math.max(1, peak * h);
    ctx.fillRect(x, (h - bar) / 2, 1, bar);
  }
}

export function ShadowPractice({
  bvid,
  page,
  sentences,
}: {
  unitId: string;
  bvid: string;
  page: number;
  sentences: ShadowSentence[];
}) {
  const [idx, setIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [rate, setRate] = useState<number>(1);
  const [showText, setShowText] = useState(false);
  const [recording, setRecording] = useState(false);
  const [score, setScore] = useState<ShadowScore | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dashRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const origPcmRef = useRef<Float32Array | null>(null);
  const userPcmRef = useRef<Float32Array | null>(null);
  const origCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const userCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const cur = sentences[idx];

  // ---- 加载 B 站音源(DASH)到隐藏 video ----
  useEffect(() => {
    if (!bvid) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/bili/play?bvid=${encodeURIComponent(bvid)}&page=${page}&mode=dash`,
        );
        const data: PlayPayload = await r.json();
        if (cancelled) return;
        if (data.error || !data.dash?.mpd) {
          setErr(data.error ?? "拿不到音源");
          return;
        }
        const v = videoRef.current;
        if (!v) return;
        const dashjs = await import("dashjs");
        if (cancelled) return;
        const player = dashjs.MediaPlayer().create();
        player.initialize(v, data.dash.mpd, false);
        dashRef.current = player;
        setReady(true);
      } catch {
        if (!cancelled) setErr("音源加载失败");
      }
    })();
    return () => {
      cancelled = true;
      try {
        dashRef.current?.destroy();
      } catch {
        // ignore
      }
      dashRef.current = null;
    };
  }, [bvid, page]);

  // 换句/换速时清空上一句的打分与波形
  useEffect(() => {
    setScore(null);
    origPcmRef.current = null;
    userPcmRef.current = null;
    drawWave(origCanvasRef.current, null, "");
    drawWave(userCanvasRef.current, null, "");
  }, [idx]);

  /** 播放当前句(A-B 循环一次):保音调变速,到句尾自动停 */
  const playSentence = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = rate;
    // 保音调变速(慢放不变调)
    (v as HTMLVideoElement & { preservesPitch?: boolean }).preservesPitch = true;
    v.currentTime = cur.from;
    const stopAt = () => {
      if (v.currentTime >= cur.to) {
        v.pause();
        v.removeEventListener("timeupdate", stopAt);
      }
    };
    v.addEventListener("timeupdate", stopAt);
    void v.play();
  }, [cur, rate]);

  // ---- 录音 ----
  const startRec = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const buf = await blob.arrayBuffer();
        const ctx =
          audioCtxRef.current ??
          (audioCtxRef.current = new AudioContext());
        const decoded = await ctx.decodeAudioData(buf);
        const pcm = decoded.getChannelData(0).slice();
        userPcmRef.current = pcm;
        drawWave(userCanvasRef.current, pcm, "var(--app-pink)");
        // 有原声就打分(原声需先在「录音对比」步骤播一次抓取,见下)
        const orig = origPcmRef.current;
        if (orig) {
          setScore(
            scoreShadow(orig, pcm, 16000, decoded.sampleRate),
          );
        }
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setErr("麦克风打不开(需授权)");
    }
  }, []);

  const stopRec = useCallback(() => {
    recRef.current?.stop();
    setRecording(false);
  }, []);

  // TODO(S1b 收尾): 在「录音对比」步骤播放原声时用 Web Audio 抓取本句 PCM
  // 存进 origPcmRef,才能给 scoreShadow 提供原声、画出原声波形并出分。
  // 目前录音 + 录音波形已可用,原声抓取待真实音源到位后在设备上联调。

  const go = (d: number) => {
    setIdx((i) => Math.min(sentences.length - 1, Math.max(0, i + d)));
    setStep(0);
    setShowText(false);
  };

  return (
    <div className="shadow-practice">
      {/* 隐藏音源:只取声音,不显示画面 */}
      <video ref={videoRef} style={{ display: "none" }} playsInline />

      {err && <p className="shadow-err">{err}</p>}

      {/* 句子清单 */}
      <ol className="shadow-list">
        {sentences.map((s, i) => (
          <li key={i}>
            <button
              className={`shadow-list-item ${i === idx ? "on" : ""}`}
              onClick={() => {
                setIdx(i);
                setStep(0);
                setShowText(false);
              }}
            >
              <b>{i + 1}</b>
              <span>{s.text}</span>
            </button>
          </li>
        ))}
      </ol>

      {/* 当前句练习区 */}
      <div className="shadow-stage">
        <div className="shadow-steps">
          {STEPS.map((s, i) => (
            <button
              key={s}
              className={`shadow-step ${i === step ? "on" : ""} ${i < step ? "done" : ""}`}
              onClick={() => {
                setStep(i);
                setShowText(i >= 1); // 精听起看文;盲听不看文
              }}
            >
              {i + 1}. {s}
            </button>
          ))}
        </div>

        <div className={`shadow-caption ${showText ? "" : "blur"}`}>
          <p className="shadow-en">{cur.text}</p>
          {cur.zh && <p className="shadow-zh">{cur.zh}</p>}
        </div>

        <div className="shadow-controls">
          <button className="app-btn-plain" onClick={() => go(-1)} disabled={idx === 0}>
            <ChevronLeft size={16} /> 上一句
          </button>
          <button className="app-btn-primary" onClick={playSentence} disabled={!ready}>
            <Play size={16} /> 播放原声
          </button>
          <div className="shadow-rates">
            {RATES.map((r) => (
              <button
                key={r}
                className={rate === r ? "on" : ""}
                onClick={() => setRate(r)}
              >
                {r}×
              </button>
            ))}
          </div>
          {recording ? (
            <button className="app-btn-primary shadow-rec on" onClick={stopRec}>
              <Square size={15} /> 停止
            </button>
          ) : (
            <button className="app-btn-primary shadow-rec" onClick={startRec}>
              <Mic size={16} /> 跟读录音
            </button>
          )}
          <button className="app-btn-plain" onClick={() => go(1)} disabled={idx === sentences.length - 1}>
            下一句 <ChevronRight size={16} />
          </button>
        </div>

        {/* 双波形对照 */}
        <div className="shadow-waves">
          <div>
            <small>原声</small>
            <canvas ref={origCanvasRef} width={520} height={56} />
          </div>
          <div>
            <small>你的录音</small>
            <canvas ref={userCanvasRef} width={520} height={56} />
          </div>
        </div>

        {score && (
          <div className="shadow-score">
            <b className="shadow-score-overall">{score.overall}</b>
            <span>发音 {score.phonetic}</span>
            <span>语调 {score.intonation}</span>
          </div>
        )}
      </div>
    </div>
  );
}
