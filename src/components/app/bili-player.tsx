"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  MessageSquare,
  MessageSquareOff,
  Maximize,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import { reportWatchProgress } from "@/lib/game/watch-actions";

// 自研 B 站播放器（思路参考 wiliwili，MIT）：
//   · DASH 画音分离 → <video> + <audio> 双轨同步播放
//   · 弹幕在 <canvas> 上自绘（滚动/顶部/底部三种模式）
//   · 逐秒记录「看过的秒」，覆盖率 ≥90% 自动打卡（跳着看也算）
// 直链要 Referer，所以流走 /api/bili/stream 代理。

interface PlayPayload {
  cid: number;
  title: string;
  durationSec: number;
  bound: boolean;
  qualityName: string;
  video: string | null;
  audio: string | null;
  progressive: string | null;
  error?: string;
}

interface DanmakuItem {
  t: number;
  mode: number;
  color: number;
  text: string;
}

interface Track {
  item: DanmakuItem;
  x: number;
  y: number;
  width: number;
  speed: number;
  born: number;
}

function fmt(sec: number): string {
  if (!Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function BiliPlayer({
  bvid,
  page,
  courseId,
  episodeN,
  resumeAt = 0,
  onCompleted,
}: {
  bvid: string;
  page: number;
  courseId: string;
  episodeN: number;
  resumeAt?: number;
  onCompleted?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [payload, setPayload] = useState<PlayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showDanmaku, setShowDanmaku] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ratioPct, setRatioPct] = useState(0);

  const danmakuRef = useRef<DanmakuItem[]>([]);
  const cursorRef = useRef(0);
  const activeRef = useRef<Track[]>([]);
  /** 看过的整秒集合——跳过的段不计入覆盖率 */
  const seenRef = useRef<Set<number>>(new Set());
  const completedRef = useRef(false);

  // 取播放地址（换集时组件由 key 重挂载，这里不需要同步清状态）
  useEffect(() => {
    let cancelled = false;
    seenRef.current = new Set();
    completedRef.current = false;
    fetch(`/api/bili/play?bvid=${encodeURIComponent(bvid)}&page=${page}`)
      .then((r) => r.json())
      .then((data: PlayPayload) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          return;
        }
        setPayload(data);
        setDuration(data.durationSec);
      })
      .catch(() => {
        if (!cancelled) setError("播放地址解析失败");
      });
    return () => {
      cancelled = true;
    };
  }, [bvid, page]);

  // 取弹幕
  useEffect(() => {
    if (!payload?.cid) return;
    let cancelled = false;
    fetch(`/api/bili/danmaku?cid=${payload.cid}`)
      .then((r) => r.json())
      .then((data: { danmaku?: DanmakuItem[] }) => {
        if (cancelled) return;
        danmakuRef.current = data.danmaku ?? [];
        cursorRef.current = 0;
      })
      .catch(() => {
        danmakuRef.current = [];
      });
    return () => {
      cancelled = true;
    };
  }, [payload?.cid]);

  // 音轨跟随视频（DASH 双轨：以 video 为时钟，audio 偏差超 0.3s 就校正）
  const syncAudio = useCallback(() => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v || !a || !payload?.audio) return;
    if (Math.abs(a.currentTime - v.currentTime) > 0.3) {
      a.currentTime = v.currentTime;
    }
  }, [payload?.audio]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      if (a && payload?.audio) {
        a.currentTime = v.currentTime;
        void a.play();
      }
    } else {
      v.pause();
      a?.pause();
    }
  }, [payload?.audio]);

  // 弹幕渲染循环
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    let raf = 0;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const LANES = 12;
    const laneFree: number[] = new Array(LANES).fill(0);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.clearRect(0, 0, w, h);
      if (!showDanmaku) {
        activeRef.current = [];
        return;
      }

      const t = video.currentTime;
      const list = danmakuRef.current;
      // 时间回跳（拖动进度条）→ 重定位游标并清屏
      if (cursorRef.current > 0 && list[cursorRef.current - 1]?.t > t + 1) {
        cursorRef.current = 0;
        activeRef.current = [];
        laneFree.fill(0);
      }
      const fontSize = Math.max(14, Math.round(h / 22));
      ctx.font = `600 ${fontSize}px ui-rounded, "PingFang SC", system-ui, sans-serif`;
      ctx.textBaseline = "top";

      while (cursorRef.current < list.length && list[cursorRef.current].t <= t) {
        const item = list[cursorRef.current++];
        if (!video.paused || true) {
          const width = ctx.measureText(item.text).width;
          const lane = laneFree.findIndex((free) => free <= t);
          const laneIndex = lane === -1 ? 0 : lane;
          const speed = (w + width) / 8; // 8 秒穿屏
          laneFree[laneIndex] = t + width / speed + 0.4;
          activeRef.current.push({
            item,
            x: w,
            y: laneIndex * (fontSize + 6) + 6,
            width,
            speed,
            born: t,
          });
        }
      }

      const alive: Track[] = [];
      for (const track of activeRef.current) {
        const { item } = track;
        const color = `#${item.color.toString(16).padStart(6, "0")}`;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.strokeStyle = "rgba(0,0,0,0.65)";
        ctx.lineWidth = 3;
        if (item.mode === 5 || item.mode === 4) {
          // 顶部/底部固定弹幕：出现 4 秒
          if (t - track.born > 4) continue;
          const x = (canvas.width - track.width) / 2;
          const y = item.mode === 5 ? 6 : canvas.height - fontSize - 10;
          ctx.strokeText(item.text, x, y);
          ctx.fillStyle = color;
          ctx.fillText(item.text, x, y);
          alive.push(track);
          continue;
        }
        const x = canvas.width - (t - track.born) * track.speed;
        if (x + track.width < 0) continue;
        ctx.strokeText(item.text, x, track.y);
        ctx.fillStyle = color;
        ctx.fillText(item.text, x, track.y);
        alive.push(track);
      }
      activeRef.current = alive;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [showDanmaku, payload]);

  // 进度记录 + 上报
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !payload) return;

    const onTime = () => {
      setCurrent(v.currentTime);
      seenRef.current.add(Math.floor(v.currentTime));
      const total = v.duration || payload.durationSec || 0;
      if (total > 0) {
        setRatioPct(
          Math.min(100, Math.round((seenRef.current.size / total) * 100)),
        );
      }
      syncAudio();
    };
    const onMeta = () => setDuration(v.duration || payload.durationSec);
    const onPlay = () => setPlaying(true);
    const onPause = () => {
      setPlaying(false);
      audioRef.current?.pause();
    };

    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, [payload, syncAudio]);

  // 每 15 秒上报一次进度（离开页面时补一次）
  useEffect(() => {
    if (!payload) return;
    const send = async () => {
      const v = videoRef.current;
      const total = v?.duration || payload.durationSec || 0;
      if (!v || total <= 0 || seenRef.current.size === 0) return;
      const r = await reportWatchProgress(
        courseId,
        episodeN,
        v.currentTime,
        total,
        seenRef.current.size,
      );
      if (r.completed && !completedRef.current) {
        completedRef.current = true;
        onCompleted?.();
      }
    };
    const timer = setInterval(send, 15000);
    const onHide = () => {
      if (document.visibilityState === "hidden") void send();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      void send();
    };
  }, [payload, courseId, episodeN, onCompleted]);

  // 续播
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !payload || resumeAt <= 0) return;
    const onReady = () => {
      if (v.currentTime < 1) v.currentTime = Math.min(resumeAt, v.duration - 5);
    };
    v.addEventListener("loadedmetadata", onReady, { once: true });
    return () => v.removeEventListener("loadedmetadata", onReady);
  }, [payload, resumeAt]);

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const total = v?.duration || duration;
    if (v && total > 0) {
      v.currentTime = Math.max(0, Math.min(total, ratio * total));
      if (audioRef.current) audioRef.current.currentTime = v.currentTime;
    }
  };

  if (error) {
    return (
      <div className="biliplayer-fallback">
        <p>{error}</p>
        <a
          href={`https://www.bilibili.com/video/${bvid}?p=${page}`}
          target="_blank"
          rel="noreferrer noopener"
          className="app-btn-plain"
        >
          去 B 站看这一集
        </a>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="biliplayer-loading">
        <Loader2 size={22} className="spin" aria-hidden />
        正在解析播放地址…
      </div>
    );
  }

  const src = payload.video ?? payload.progressive ?? undefined;

  return (
    <div className="biliplayer" ref={wrapRef}>
      <div className="biliplayer-stage" onClick={togglePlay}>
        <video
          ref={videoRef}
          src={src}
          playsInline
          muted={muted || !!payload.audio}
          preload="metadata"
        />
        {payload.audio && (
          <audio ref={audioRef} src={payload.audio} muted={muted} preload="metadata" />
        )}
        <canvas ref={canvasRef} className="biliplayer-danmaku" />
        {!playing && (
          <button className="biliplayer-bigplay" aria-label="播放">
            <Play size={34} fill="currentColor" />
          </button>
        )}
      </div>

      <div className="biliplayer-bar">
        <div className="biliplayer-track" onClick={seek}>
          <i style={{ width: `${duration ? (current / duration) * 100 : 0}%` }} />
        </div>
        <div className="biliplayer-controls">
          <button onClick={togglePlay} aria-label={playing ? "暂停" : "播放"}>
            {playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
          </button>
          <span className="biliplayer-time">
            {fmt(current)} / {fmt(duration)}
          </span>
          <button
            onClick={() => {
              setMuted((m) => !m);
            }}
            aria-label={muted ? "取消静音" : "静音"}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button
            className={showDanmaku ? "on" : undefined}
            onClick={() => setShowDanmaku((d) => !d)}
            aria-pressed={showDanmaku}
            title={showDanmaku ? "关闭弹幕" : "开启弹幕"}
          >
            {showDanmaku ? (
              <MessageSquare size={18} />
            ) : (
              <MessageSquareOff size={18} />
            )}
          </button>
          <span className="biliplayer-watch" title="本集观看覆盖率，≥90% 自动打卡">
            已看 {ratioPct}%
          </span>
          <button
            onClick={() => void wrapRef.current?.requestFullscreen?.()}
            aria-label="全屏"
            title="全屏"
          >
            <Maximize size={18} />
          </button>
        </div>
      </div>

      {!payload.bound && (
        <p className="biliplayer-hint">
          绑定 B 站账号后可解锁高清晰度（当前 {payload.qualityName || "标清"}）
        </p>
      )}
    </div>
  );
}
