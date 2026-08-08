"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Play, Square } from "lucide-react";
import type { ShadowSentence } from "@/lib/content/schema";
import { scoreShadow, type ShadowScore } from "@/lib/shadow/score";
import { completeShadowSegment } from "@/lib/game/shadow-actions";
import { celebrate } from "@/lib/celebrate";
import { rewardToast } from "@/lib/reward-feedback";

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
  unitId,
  seg,
  bvid,
  page,
  sentences,
}: {
  unitId: string;
  seg: number;
  bvid: string;
  page: number;
  sentences: ShadowSentence[];
}) {
  const [idx, setIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [rate, setRate] = useState<number>(1);
  const [recording, setRecording] = useState(false);
  const [score, setScore] = useState<ShadowScore | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<Set<number>>(new Set());

  const videoRef = useRef<HTMLVideoElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dashRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const srcNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const origPcmRef = useRef<Float32Array | null>(null);
  const userPcmRef = useRef<Float32Array | null>(null);
  const origCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const userCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const completedRef = useRef(false);

  const cur = sentences[idx];

  // 换句时清掉上一句的打分(渲染期调整,别在 effect 里 setState)
  const [prevIdx, setPrevIdx] = useState(idx);
  if (idx !== prevIdx) {
    setPrevIdx(idx);
    setScore(null);
  }

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

  // 换句时清空上一句的波形与缓存(纯副作用,非 setState)
  useEffect(() => {
    origPcmRef.current = null;
    userPcmRef.current = null;
    drawWave(origCanvasRef.current, null, "");
    drawWave(userCanvasRef.current, null, "");
  }, [idx]);

  /** 播放当前句(A-B 循环一次):保音调变速 + Web Audio 抓本句原声 PCM */
  const playSentence = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = rate;
    // 保音调变速(慢放不变调)
    (v as HTMLVideoElement & { preservesPitch?: boolean }).preservesPitch = true;

    let proc: ScriptProcessorNode | null = null;
    const chunks: Float32Array[] = [];
    try {
      const ctx =
        audioCtxRef.current ?? (audioCtxRef.current = new AudioContext());
      if (ctx.state === "suspended") void ctx.resume();
      // createMediaElementSource 每个元素只能建一次
      if (!srcNodeRef.current) {
        srcNodeRef.current = ctx.createMediaElementSource(v);
        srcNodeRef.current.connect(ctx.destination);
      }
      proc = ctx.createScriptProcessor(4096, 1, 1);
      srcNodeRef.current.connect(proc);
      proc.connect(ctx.destination);
      proc.onaudioprocess = (e) => {
        if (v.currentTime >= cur.from && v.currentTime <= cur.to + 0.05) {
          chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
        }
      };
    } catch {
      // 环境不支持就只听不抓,不影响练习
    }

    v.currentTime = cur.from;
    const finish = () => {
      if (chunks.length) {
        const len = chunks.reduce((s, c) => s + c.length, 0);
        const pcm = new Float32Array(len);
        let o = 0;
        for (const c of chunks) {
          pcm.set(c, o);
          o += c.length;
        }
        origPcmRef.current = pcm;
        drawWave(origCanvasRef.current, pcm, "var(--app-blue)");
      }
      try {
        proc?.disconnect();
      } catch {
        // ignore
      }
    };
    const stopAt = () => {
      if (v.currentTime >= cur.to) {
        v.pause();
        v.removeEventListener("timeupdate", stopAt);
        finish();
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
        // 有原声(先点过「播放原声」抓取)就打分
        const orig = origPcmRef.current;
        if (orig) {
          const origRate = audioCtxRef.current?.sampleRate ?? 44100;
          setScore(scoreShadow(orig, pcm, origRate, decoded.sampleRate));
        }
        // 记下这句已练;本段每句都练过 → 练完这段发 XP(幂等)
        setRecorded((prev) => {
          const next = new Set(prev).add(idx);
          if (next.size >= sentences.length && !completedRef.current) {
            completedRef.current = true;
            void completeShadowSegment(unitId, seg).then((r) => {
              if (r.ok && r.gained) {
                rewardToast({ text: `跟读段完成 +${r.gained} XP`, tone: "xp" });
                celebrate({
                  kind: "quest",
                  title: "这一段练完了！",
                  subtitle: "回地图继续下一节点",
                });
              }
            });
          }
          return next;
        });
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setErr("麦克风打不开(需授权)");
    }
  }, [idx, sentences.length, unitId, seg]);

  const stopRec = useCallback(() => {
    recRef.current?.stop();
    setRecording(false);
  }, []);

  // 原声抓取已在 playSentence 里做:听/跟读步先播放抓本句 PCM,录音步即出分。

  const isLast = idx === sentences.length - 1 && step === STEPS.length - 1;

  // 「准备好了,下一步」:推进到下一步;末步则进到下一句第 1 步(手动,不自动跳)
  const nextStep = () => {
    if (recording) stopRec();
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else if (idx < sentences.length - 1) {
      setIdx(idx + 1);
      setStep(0);
    }
  };

  // 每步一种交互:听/跟读步只有「播放」,录音步只有「录音」;文字在盲听/复述隐藏
  const isRecordStep = step >= 3; // 3 录音对比 / 4 复述
  const showWaves = step >= 2; // 跟读起显示波形(跟读看原声,录音步双波形对照)
  const blurText = step === 0 || step === 4;
  const PLAY_LABEL = ["盲听(不看字)", "精听(看字)", "跟读(边听边说)"];

  // 波形画布是按需挂载的:进到显示波形的步骤时,用已抓到的 PCM 重绘一次
  // (原声在播放步抓取,但画布那时没挂载 → 到这一步才画得出)
  useEffect(() => {
    if (!showWaves) return;
    drawWave(origCanvasRef.current, origPcmRef.current, "var(--app-blue)");
    drawWave(userCanvasRef.current, userPcmRef.current, "var(--app-pink)");
  }, [showWaves, step, idx]);

  return (
    <div className="shadow-practice">
      {/* 隐藏音源:只取声音,不显示画面 */}
      <video ref={videoRef} style={{ display: "none" }} playsInline />

      {err && <p className="shadow-err">{err}</p>}

      {/* 当前句练习区:一次只练一句,录完自动进到下一句 */}
      <div className="shadow-stage">
        <div className="shadow-progress">
          <span className="shadow-pos">
            第 <b>{idx + 1}</b> / {sentences.length} 句
          </span>
          <span className="shadow-dots" aria-hidden>
            {sentences.map((_, i) => (
              <i
                key={i}
                className={
                  recorded.has(i) ? "done" : i === idx ? "on" : undefined
                }
              />
            ))}
          </span>
          <span className="shadow-done-count">已跟读 {recorded.size}</span>
        </div>
        {/* 五步进度:点一步就是那一步的交互 */}
        <div className="shadow-steps">
          {STEPS.map((s, i) => (
            <button
              key={s}
              className={`shadow-step ${i === step ? "on" : ""} ${i < step ? "done" : ""}`}
              onClick={() => {
                if (recording) stopRec();
                setStep(i);
              }}
            >
              {i + 1}. {s}
            </button>
          ))}
        </div>

        <div className={`shadow-caption ${blurText ? "blur" : ""}`}>
          <p className="shadow-en">{cur.text}</p>
          {cur.zh && <p className="shadow-zh">{cur.zh}</p>}
        </div>

        {/* 单一交互:听/跟读步 = 播放;录音步 = 录音 */}
        <div className="shadow-action">
          {!isRecordStep ? (
            <>
              <button
                className="app-btn-primary shadow-bigbtn"
                onClick={playSentence}
                disabled={!ready}
              >
                <Play size={20} /> {PLAY_LABEL[step] ?? "播放原声"}
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
            </>
          ) : recording ? (
            <button
              className="app-btn-primary shadow-bigbtn shadow-rec on"
              onClick={stopRec}
            >
              <Square size={18} /> 停止录音
            </button>
          ) : (
            <button
              className="app-btn-primary shadow-bigbtn shadow-rec"
              onClick={startRec}
              disabled={!ready}
            >
              <Mic size={20} /> {step === 4 ? "复述录音(不看字)" : "跟读录音"}
            </button>
          )}
        </div>

        {/* 跟读步显示原声波形;录音步再叠上「你的录音」波形 + 打分 */}
        {showWaves && (
          <>
            <div className="shadow-waves">
              <div>
                <small>原声</small>
                <canvas ref={origCanvasRef} width={520} height={84} />
              </div>
              {isRecordStep && (
                <div>
                  <small>你的录音</small>
                  <canvas ref={userCanvasRef} width={520} height={84} />
                </div>
              )}
            </div>
            {isRecordStep && score && (
              <div className="shadow-score">
                <b className="shadow-score-overall">{score.overall}</b>
                <span>发音 {score.phonetic}</span>
                <span>语调 {score.intonation}</span>
              </div>
            )}
          </>
        )}

        {/* 准备好了再手动进入下一步(末步则进下一句),不自动跳 */}
        <button className="shadow-next" onClick={nextStep} disabled={isLast}>
          {step < STEPS.length - 1
            ? "准备好了,下一步 →"
            : idx < sentences.length - 1
              ? "完成本句,下一句 →"
              : "已是最后一句"}
        </button>
      </div>
    </div>
  );
}
