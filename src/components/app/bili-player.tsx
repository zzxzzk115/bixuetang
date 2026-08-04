"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Captions,
  CaptionsOff,
  Gauge,
  Loader2,
  MessageSquare,
  MessageSquareOff,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { reportWatchProgress } from "@/lib/game/watch-actions";
import { saveCcOffset, savePlayerPrefs } from "@/lib/game/user-state-actions";
import { TermUnlockPopup, type UnlockedTerm } from "./term-unlock-popup";
import { RATES, prefsStore, type PlayerPrefs } from "./player-settings";

// 自研 bilibili 播放器（思路参考 wiliwili，MIT）：
//   · DASH 画音分离 → <video> + <audio> 双轨同步
//   · 弹幕在 <canvas> 自绘，支持不透明度/字号/速度/显示区域/分类屏蔽
//   · CC 字幕支持多语言切换与字号/位置/描边样式
//   · 逐秒记录看过的秒，覆盖率 ≥90% 自动打卡（跳着看也算）

interface Quality {
  id: number;
  name: string;
  url: string;
}

interface PlayPayload {
  aid: number;
  cid: number;
  title: string;
  durationSec: number;
  bound: boolean;
  qualityName: string;
  qualities: Quality[];
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

interface SubtitleCue {
  from: number;
  to: number;
  text: string;
}

interface SubtitleTrack {
  lan: string;
  lanDoc: string;
  cues: SubtitleCue[];
  ai: boolean;
  suspect: boolean;
}

interface Track {
  item: DanmakuItem;
  y: number;
  width: number;
  speed: number;
  born: number;
}

/** 续播提示的反悔窗口（秒） */
const RESUME_SECONDS = 5;

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
  initialRatioPct = 0,
  serverPrefs = null,
  onCompleted,
  onLoaded,
}: {
  bvid: string;
  page: number;
  courseId: string;
  episodeN: number;
  resumeAt?: number;
  /** 库里已累计的观看覆盖率，显示时不能被本次会话打回 0 */
  initialRatioPct?: number;
  /** 服务端存的播放偏好 JSON（权威值，跨设备一致） */
  serverPrefs?: string | null;
  onCompleted?: () => void;
  onLoaded?: (info: { aid: number; cid: number }) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [payload, setPayload] = useState<PlayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [tracks, setTracks] = useState<SubtitleTrack[]>([]);
  /** 每条启用轨道当前该显示的文本（顺序与 activeTracks 一致） */
  const [cues, setCues] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ratioPct, setRatioPct] = useState(initialRatioPct);
  const [cinema, setCinema] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  /** 续播提示里待跳转的秒数；null = 不提示（初值直接由 props 推导，不在 effect 里 set） */
  const [resumeTip, setResumeTip] = useState<number | null>(
    resumeAt > 5 ? resumeAt : null,
  );
  /** 自动跳转倒计时剩余秒 */
  const [resumeLeft, setResumeLeft] = useState(RESUME_SECONDS);
  /** 看完这一集新解锁的卷宗词条 */
  const [newTerms, setNewTerms] = useState<UnlockedTerm[]>([]);
  /** 本视频的字幕时间轴偏移（毫秒，正数=字幕延后） */
  const [ccOffset, setCcOffset] = useState(0);
  // timeupdate 回调里要读最新值，但不能让它每次改动都重挂监听
  const ccOffsetRef = useRef(0);
  /** 打开的设置面板 */
  const [panel, setPanel] = useState<"none" | "danmaku" | "cc" | "rate" | "quality">(
    "none",
  );

  const prefs = useSyncExternalStore(
    prefsStore.subscribe,
    prefsStore.get,
    prefsStore.getServerSnapshot,
  );

  const danmakuRef = useRef<DanmakuItem[]>([]);
  const cursorRef = useRef(0);
  const activeRef = useRef<Track[]>([]);
  const seenRef = useRef<Set<number>>(new Set());
  const completedRef = useRef(false);

  // 偏好：库里那份是权威，挂载时 hydrate 一次；之后每次改动落库
  useEffect(() => {
    prefsStore.bindPersist((json) => void savePlayerPrefs(json));
    prefsStore.hydrate(serverPrefs);
  }, [serverPrefs]);

  const update = useCallback(
    (patch: Partial<PlayerPrefs>) => prefsStore.set(patch),
    [],
  );
  const updateDanmaku = useCallback(
    (patch: Partial<PlayerPrefs["danmaku"]>) =>
      prefsStore.set({ danmaku: { ...prefsStore.get().danmaku, ...patch } }),
    [],
  );
  const updateCc = useCallback(
    (patch: Partial<PlayerPrefs["cc"]>) =>
      prefsStore.set({ cc: { ...prefsStore.get().cc, ...patch } }),
    [],
  );

  /**
   * 调字幕时间轴。立刻生效，落库防抖 600ms——按住 -0.5 连点时
   * 不该每下都写一次数据库。
   */
  const offsetSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeCcOffset = useCallback(
    (deltaMs: number) => {
      const cid = payload?.cid;
      setCcOffset((prev) => {
        const next = Math.max(-30_000, Math.min(30_000, prev + deltaMs));
        ccOffsetRef.current = next;
        if (cid) {
          if (offsetSaveRef.current) clearTimeout(offsetSaveRef.current);
          offsetSaveRef.current = setTimeout(() => {
            void saveCcOffset(cid, next);
          }, 600);
        }
        return next;
      });
    },
    [payload?.cid],
  );

  // 取播放地址
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
        onLoaded?.({ aid: data.aid, cid: data.cid });
      })
      .catch(() => {
        if (!cancelled) setError("播放地址解析失败");
      });
    return () => {
      cancelled = true;
    };
  }, [bvid, page, onLoaded]);

  // 弹幕
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

  // CC 字幕
  useEffect(() => {
    if (!payload?.cid) return;
    let cancelled = false;
    fetch(
      `/api/bili/subtitle?bvid=${encodeURIComponent(bvid)}&cid=${payload.cid}&duration=${payload.durationSec}`,
    )
      .then((r) => r.json())
      .then((data: { tracks?: SubtitleTrack[]; offsetMs?: number }) => {
        if (cancelled) return;
        setTracks(data.tracks ?? []);
        const saved = data.offsetMs ?? 0;
        setCcOffset(saved);
        ccOffsetRef.current = saved;
      })
      .catch(() => {
        if (!cancelled) setTracks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [payload?.cid, payload?.durationSec, bvid]);

  // 可多选叠加：选了几条就显示几行。用户没选过时自动挑：
  // 人工中文轨优先（bilibili 的中文轨往往自带中英双语），其次人工英文轨。
  //
  // 只有 AI 轨时**不自动开**：bilibili 的 AI 字幕经常是别的视频的内容，
  // 自动挂上去只会误导人。这种情况提示一句，让用户自己决定要不要看。
  const activeTracks = useMemo(() => {
    if (tracks.length === 0) return [];
    const picked = tracks.filter((t) => prefs.cc.lans.includes(t.lan));
    if (picked.length > 0) return picked;

    const human = tracks.filter((t) => !t.ai && !t.suspect);
    const zh = human.find((t) => t.lan.toLowerCase().startsWith("zh"));
    const en = human.find((t) => t.lan.toLowerCase().startsWith("en"));
    if (zh && en) return [zh, en];
    if (zh) return [zh];
    if (en) return [en];
    if (human.length > 0) return [human[0]];
    return [];
  }, [tracks, prefs.cc.lans]);

  /** 有轨可选，但全是 AI / 可疑轨，且用户还没手动选过 */
  const onlyAiTracks =
    tracks.length > 0 && activeTracks.length === 0 && prefs.cc.lans.length === 0;

  // 当前清晰度的视频地址
  const videoSrc = useMemo(() => {
    if (!payload) return undefined;
    if (payload.qualities.length === 0) {
      return payload.video ?? payload.progressive ?? undefined;
    }
    const picked =
      payload.qualities.find((q) => q.id === prefs.qualityId) ??
      payload.qualities[0];
    return picked.url;
  }, [payload, prefs.qualityId]);

  const syncAudio = useCallback(() => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v || !a || !payload?.audio) return;
    if (Math.abs(a.currentTime - v.currentTime) > 0.3) {
      a.currentTime = v.currentTime;
    }
    if (a.playbackRate !== v.playbackRate) a.playbackRate = v.playbackRate;
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

  // 切走标签页 / 窗口失焦时自动暂停：人不在了还接着放，那段进度是白记的。
  // 全屏播放时不管（切出去多半是临时的），可在设置里关掉。
  useEffect(() => {
    if (!payload || !prefs.pauseOnBlur) return;
    const pause = () => {
      if (document.fullscreenElement) return;
      const v = videoRef.current;
      if (v && !v.paused) {
        v.pause();
        audioRef.current?.pause();
      }
    };
    const onVisibility = () => {
      if (document.hidden) pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", pause);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", pause);
    };
  }, [payload, prefs.pauseOnBlur]);

  // 音量 / 静音 / 倍速 → 应用到媒体元素
  useEffect(() => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (v) {
      v.playbackRate = prefs.rate;
      // DASH 时声音在 audio 轨，video 恒静音
      v.muted = payload?.audio ? true : prefs.muted;
      v.volume = prefs.volume;
    }
    if (a) {
      a.playbackRate = prefs.rate;
      a.muted = prefs.muted;
      a.volume = prefs.volume;
    }
  }, [prefs.rate, prefs.muted, prefs.volume, payload?.audio, videoSrc]);

  // 弹幕渲染
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    let raf = 0;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const laneFree: number[] = [];

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.clearRect(0, 0, w, h);
      const d = prefsStore.get().danmaku;
      if (!d.on) {
        activeRef.current = [];
        return;
      }

      const t = video.currentTime;
      const list = danmakuRef.current;
      if (cursorRef.current > 0 && list[cursorRef.current - 1]?.t > t + 1) {
        cursorRef.current = 0;
        activeRef.current = [];
        laneFree.length = 0;
      }

      const fontSize = Math.max(12, Math.round((h / 22) * d.scale));
      const lineHeight = fontSize + 6;
      const lanes = Math.max(1, Math.floor((h * d.area) / lineHeight));
      while (laneFree.length < lanes) laneFree.push(0);

      ctx.font = `600 ${fontSize}px ui-rounded, "PingFang SC", system-ui, sans-serif`;
      ctx.textBaseline = "top";
      ctx.globalAlpha = d.opacity;

      while (cursorRef.current < list.length && list[cursorRef.current].t <= t) {
        const item = list[cursorRef.current++];
        const isTop = item.mode === 5;
        const isBottom = item.mode === 4;
        if (isTop && d.blockTop) continue;
        if (isBottom && d.blockBottom) continue;
        if (!isTop && !isBottom && d.blockScroll) continue;

        const width = ctx.measureText(item.text).width;
        // 滚动弹幕：8 秒穿屏，speed 越大越快
        const speed = ((w + width) / 8) * d.speed;
        let laneIndex = 0;
        if (!isTop && !isBottom) {
          const free = laneFree.findIndex((until) => until <= t);
          laneIndex = free === -1 ? 0 : free;
          laneFree[laneIndex] = t + width / speed + 0.4;
        }
        activeRef.current.push({
          item,
          y: laneIndex * lineHeight + 6,
          width,
          speed,
          born: t,
        });
      }

      const alive: Track[] = [];
      for (const track of activeRef.current) {
        const { item } = track;
        const color = `#${item.color.toString(16).padStart(6, "0")}`;
        ctx.strokeStyle = "rgba(0,0,0,0.7)";
        ctx.lineWidth = 3;
        if (item.mode === 5 || item.mode === 4) {
          if (t - track.born > 4) continue;
          const x = (canvas.width - track.width) / 2;
          const y =
            item.mode === 5 ? 6 : canvas.height - fontSize - 10;
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
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [payload]);

  // 进度记录 + 字幕行
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !payload) return;

    const onTime = () => {
      setCurrent(v.currentTime);
      seenRef.current.add(Math.floor(v.currentTime));
      const total = v.duration || payload.durationSec || 0;
      if (total > 0) {
        // 和库里已累计的取大值：本次会话的 seen 从零开始，直接显示它
        // 会让「已看 70%」的一集重进后变成 0%
        setRatioPct(
          Math.max(
            initialRatioPct,
            Math.min(100, Math.round((seenRef.current.size / total) * 100)),
          ),
        );
      }
      if (prefsStore.get().cc.on && activeTracks.length > 0) {
        // 正偏移 = 字幕延后出现，所以查表时把时间轴往回拨
        const t = v.currentTime - ccOffsetRef.current / 1000;
        setCues(
          activeTracks.map(
            (track) =>
              track.cues.find((c) => t >= c.from && t <= c.to)?.text ?? "",
          ),
        );
      } else {
        setCues([]);
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
  }, [payload, syncAudio, activeTracks, prefs.cc.on, initialRatioPct]);

  // 定时上报观看进度
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
        // 看够比例自动打卡的这一路，也要报出新解锁的词条
        const terms = r.settle?.unlockedTerms ?? [];
        if (terms.length > 0) setNewTerms(terms);
        onCompleted?.();
      }
    };
    // 10 秒一次：进度落库要够密，否则「上次看到哪」会差一截
    const timer = setInterval(send, 10000);
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

  /** 跳到上次的进度并立刻续播 */
  const jumpToResume = useCallback(
    (at: number) => {
      const v = videoRef.current;
      const a = audioRef.current;
      setResumeTip(null);
      if (!v) return;
      const apply = () => {
        const total = v.duration || payload?.durationSec || 0;
        v.currentTime = total > 0 ? Math.min(at, total - 5) : at;
        if (a) a.currentTime = v.currentTime;
        void v.play();
        if (a && payload?.audio) void a.play();
      };
      // metadata 还没到手时 currentTime 是写不进去的，等一下再跳
      if (v.readyState >= 1) apply();
      else v.addEventListener("loadedmetadata", apply, { once: true });
    },
    [payload?.audio, payload?.durationSec],
  );

  // 续播：不静默跳，给 3 秒反悔窗口（倒计时可见）；超时没点「从头开始」就跳过去
  useEffect(() => {
    if (resumeTip === null || !payload) return;
    const total = payload.durationSec || 0;
    // 离结尾太近等于看完了，不必续播
    if (total > 0 && resumeTip > total - 10) {
      const drop = setTimeout(() => setResumeTip(null), 0);
      return () => clearTimeout(drop);
    }
    // 倒计时从 RESUME_SECONDS 起（state 初值就是它，无需在这里重置）
    const tick = setInterval(() => {
      setResumeLeft((n) => {
        if (n <= 1) {
          clearInterval(tick);
          jumpToResume(resumeTip);
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [payload, resumeTip, jumpToResume]);

  // 全屏（被拒则影院模式）
  const toggleFullscreen = useCallback(async () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    if (cinema) {
      setCinema(false);
      return;
    }
    try {
      await el.requestFullscreen();
    } catch {
      setCinema(true);
    }
  }, [cinema]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!cinema) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCinema(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cinema]);

  /** 跳到绝对时间，音轨跟着走 */
  const seekTo = useCallback(
    (sec: number) => {
      const v = videoRef.current;
      const total = v?.duration || duration;
      if (!v || total <= 0) return;
      v.currentTime = Math.max(0, Math.min(total, sec));
      if (audioRef.current) audioRef.current.currentTime = v.currentTime;
      setCurrent(v.currentTime);
    },
    [duration],
  );

  /** 相对当前位置快进/快退 */
  const nudge = useCallback(
    (deltaSec: number) => {
      const v = videoRef.current;
      if (v) seekTo(v.currentTime + deltaSec);
    },
    [seekTo],
  );

  // 进度条拖拽。用 pointer 事件一套覆盖鼠标与触摸，
  // setPointerCapture 让手指/光标移出进度条后依然跟手。
  const draggingRef = useRef(false);
  const seekAtClientX = useCallback(
    (clientX: number, el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      const total = videoRef.current?.duration || duration;
      if (total > 0) seekTo(ratio * total);
    },
    [duration, seekTo],
  );

  const onTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    seekAtClientX(e.clientX, e.currentTarget);
  };
  const onTrackPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingRef.current) seekAtClientX(e.clientX, e.currentTarget);
  };
  const onTrackPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  // 键盘控制。只在鼠标停在播放器上或播放器内有焦点时接管按键——
  // 否则在页面别处敲空格会莫名其妙地暂停视频。
  const hoverRef = useRef(false);
  useEffect(() => {
    if (!payload) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // 别抢输入框和滑块的按键
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const inPlayer =
        hoverRef.current ||
        isFullscreen ||
        cinema ||
        (wrapRef.current?.contains(document.activeElement) ?? false);
      if (!inPlayer) return;

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          nudge(e.shiftKey ? -30 : -5);
          break;
        case "ArrowRight":
          e.preventDefault();
          nudge(e.shiftKey ? 30 : 5);
          break;
        case "ArrowUp":
          e.preventDefault();
          update({ volume: Math.min(1, prefs.volume + 0.1), muted: false });
          break;
        case "ArrowDown": {
          e.preventDefault();
          const next = Math.max(0, prefs.volume - 0.1);
          update({ volume: next, muted: next === 0 });
          break;
        }
        case "m":
          update({ muted: !prefs.muted });
          break;
        case "f":
          void toggleFullscreen();
          break;
        case "c":
          updateCc({ on: !prefs.cc.on });
          break;
        case "d":
          updateDanmaku({ on: !prefs.danmaku.on });
          break;
        default:
          // 数字键跳到对应百分比，跟主流播放器一致
          if (/^[0-9]$/.test(e.key)) {
            const total = videoRef.current?.duration || duration;
            if (total > 0) seekTo((total * Number(e.key)) / 10);
          }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    payload,
    isFullscreen,
    cinema,
    prefs.volume,
    prefs.muted,
    prefs.cc.on,
    prefs.danmaku.on,
    duration,
    togglePlay,
    nudge,
    seekTo,
    update,
    updateCc,
    updateDanmaku,
    toggleFullscreen,
  ]);

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
          去 bilibili 看这一集
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

  const VolumeIcon =
    prefs.muted || prefs.volume === 0
      ? VolumeX
      : prefs.volume < 0.5
        ? Volume1
        : Volume2;
  const currentQuality =
    payload.qualities.find((q) => q.id === prefs.qualityId) ??
    payload.qualities[0];

  return (
    <div
      className={`biliplayer ${cinema ? "cinema" : ""} ${isFullscreen ? "is-fs" : ""}`}
      ref={wrapRef}
      // 键盘只在指针停在播放器上时接管，免得在页面别处敲空格也暂停视频
      onPointerEnter={() => {
        hoverRef.current = true;
      }}
      onPointerLeave={() => {
        hoverRef.current = false;
      }}
    >
      <div className="biliplayer-stage" onClick={() => setPanel("none")}>
        <video
          ref={videoRef}
          src={videoSrc}
          playsInline
          preload="metadata"
          onClick={togglePlay}
        />
        {payload.audio && (
          <audio ref={audioRef} src={payload.audio} preload="metadata" />
        )}
        <canvas ref={canvasRef} className="biliplayer-danmaku" />
        {prefs.cc.on && cues.some(Boolean) && (
          <div
            className={`biliplayer-cc style-${prefs.cc.style}`}
            style={{ bottom: `${prefs.cc.bottom * 100}%` }}
          >
            {cues.map((text, i) =>
              text ? (
                <span
                  key={activeTracks[i]?.lan ?? i}
                  // 叠加时第二条起略小一点，主次分明
                  style={{
                    fontSize: `${prefs.cc.scale * (i === 0 ? 100 : 86)}%`,
                  }}
                >
                  {text}
                </span>
              ) : null,
            )}
          </div>
        )}
        {resumeTip !== null && (
          <div
            className="biliplayer-resume"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="biliplayer-resume-text">
              上次看到 <b>{fmt(resumeTip)}</b>
              <small>{resumeLeft} 秒后自动继续</small>
            </span>
            <span className="biliplayer-resume-acts">
              <button
                className="is-primary"
                onClick={() => jumpToResume(resumeTip)}
              >
                <SkipForward size={14} aria-hidden /> 立即跳转
              </button>
              <button
                onClick={() => {
                  // 取消 = 从头看
                  setResumeTip(null);
                }}
              >
                <RotateCcw size={14} aria-hidden /> 从头开始
              </button>
            </span>
            <i
              className="biliplayer-resume-bar"
              style={{ width: `${(resumeLeft / RESUME_SECONDS) * 100}%` }}
            />
          </div>
        )}
        {!playing && (
          <button
            className="biliplayer-bigplay"
            aria-label="播放"
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
          >
            <Play size={34} fill="currentColor" />
          </button>
        )}
      </div>

      <div className="biliplayer-bar">
        <div
          className="biliplayer-track"
          role="slider"
          tabIndex={0}
          aria-label="播放进度"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(current)}
          aria-valuetext={`${fmt(current)} / ${fmt(duration)}`}
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={onTrackPointerUp}
          onPointerCancel={onTrackPointerUp}
        >
          <i style={{ width: `${duration ? (current / duration) * 100 : 0}%` }}>
            {/* 拖拽手柄：触摸屏上没有它就只能盲拖 */}
            <b className="biliplayer-thumb" />
          </i>
        </div>

        <div className="biliplayer-controls">
          {/* 左组：播放/时间/音量。右组：所有带弹层的设置——弹层从右侧展开，
              按钮就得挨着右边，否则全屏时鼠标要横跨整个屏幕 */}
          <button onClick={togglePlay} aria-label={playing ? "暂停" : "播放"}>
            {playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
          </button>

          <span className="biliplayer-time">
            {fmt(current)} / {fmt(duration)}
          </span>

          {/* 音量：图标切静音 + 滑块调音量 */}
          <div className="biliplayer-volume">
            <button
              onClick={() => update({ muted: !prefs.muted })}
              aria-label={prefs.muted ? "取消静音" : "静音"}
            >
              <VolumeIcon size={18} />
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round((prefs.muted ? 0 : prefs.volume) * 100)}
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                update({ volume: v, muted: v === 0 });
              }}
              aria-label="音量"
            />
          </div>

          <span className="biliplayer-spacer" />

          <button
            className={panel === "rate" ? "on" : undefined}
            onClick={() => setPanel(panel === "rate" ? "none" : "rate")}
            title="播放速度"
          >
            <Gauge size={18} />
            <em className="biliplayer-badge">{prefs.rate}×</em>
          </button>

          <button
            className={prefs.danmaku.on ? "on" : undefined}
            onClick={() => setPanel(panel === "danmaku" ? "none" : "danmaku")}
            title="弹幕设置"
          >
            {prefs.danmaku.on ? (
              <MessageSquare size={18} />
            ) : (
              <MessageSquareOff size={18} />
            )}
          </button>

          <button
            className={prefs.cc.on && tracks.length > 0 ? "on" : undefined}
            onClick={() => setPanel(panel === "cc" ? "none" : "cc")}
            title="字幕设置"
            disabled={tracks.length === 0}
          >
            {prefs.cc.on && tracks.length > 0 ? (
              <Captions size={18} />
            ) : (
              <CaptionsOff size={18} />
            )}
          </button>

          {payload.qualities.length > 1 && (
            <button
              className={panel === "quality" ? "on" : undefined}
              onClick={() => setPanel(panel === "quality" ? "none" : "quality")}
              title="清晰度"
            >
              <Settings2 size={18} />
              <em className="biliplayer-badge">{currentQuality?.name ?? ""}</em>
            </button>
          )}

          <span className="biliplayer-watch" title="本集观看覆盖率，≥90% 自动打卡">
            {ratioPct}%
          </span>

          <button
            onClick={() => void toggleFullscreen()}
            aria-label={cinema || isFullscreen ? "退出全屏" : "全屏"}
            title={cinema || isFullscreen ? "退出全屏（Esc）" : "全屏"}
            className={cinema || isFullscreen ? "on" : undefined}
          >
            {cinema || isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>

        {panel === "rate" && (
          <div className="biliplayer-panel">
            <h4>播放</h4>
            <div className="biliplayer-field">
              <span>速度</span>
              <div className="biliplayer-chips">
                {RATES.map((r) => (
                  <button
                    key={r}
                    className={prefs.rate === r ? "on" : undefined}
                    onClick={() => update({ rate: r })}
                  >
                    {r}×
                  </button>
                ))}
              </div>
            </div>
            <div className="biliplayer-field">
              <span>离开页面</span>
              <div className="biliplayer-chips">
                <button
                  className={prefs.pauseOnBlur ? "on" : undefined}
                  onClick={() => update({ pauseOnBlur: true })}
                >
                  自动暂停
                </button>
                <button
                  className={!prefs.pauseOnBlur ? "on" : undefined}
                  onClick={() => update({ pauseOnBlur: false })}
                >
                  继续播放
                </button>
              </div>
            </div>
          </div>
        )}

        {panel === "quality" && (
          <div className="biliplayer-panel">
            <h4>清晰度</h4>
            <div className="biliplayer-chips">
              {payload.qualities.map((q) => (
                <button
                  key={q.id}
                  className={currentQuality?.id === q.id ? "on" : undefined}
                  onClick={() => update({ qualityId: q.id })}
                >
                  {q.name}
                </button>
              ))}
            </div>
            {!payload.bound && (
              <p className="biliplayer-panel-note">绑定 bilibili 账号可解锁更高清晰度</p>
            )}
          </div>
        )}

        {panel === "danmaku" && (
          <div className="biliplayer-panel">
            <h4>
              弹幕
              <label className="biliplayer-switch">
                <input
                  type="checkbox"
                  checked={prefs.danmaku.on}
                  onChange={(e) => updateDanmaku({ on: e.target.checked })}
                />
                <span>{prefs.danmaku.on ? "开" : "关"}</span>
              </label>
            </h4>
            <label className="biliplayer-slider">
              不透明度
              <input
                type="range"
                min={10}
                max={100}
                value={Math.round(prefs.danmaku.opacity * 100)}
                onChange={(e) =>
                  updateDanmaku({ opacity: Number(e.target.value) / 100 })
                }
              />
              <b>{Math.round(prefs.danmaku.opacity * 100)}%</b>
            </label>
            <label className="biliplayer-slider">
              字号
              <input
                type="range"
                min={60}
                max={160}
                value={Math.round(prefs.danmaku.scale * 100)}
                onChange={(e) =>
                  updateDanmaku({ scale: Number(e.target.value) / 100 })
                }
              />
              <b>{Math.round(prefs.danmaku.scale * 100)}%</b>
            </label>
            <label className="biliplayer-slider">
              速度
              <input
                type="range"
                min={50}
                max={200}
                value={Math.round(prefs.danmaku.speed * 100)}
                onChange={(e) =>
                  updateDanmaku({ speed: Number(e.target.value) / 100 })
                }
              />
              <b>{prefs.danmaku.speed.toFixed(1)}×</b>
            </label>
            <div className="biliplayer-field">
              <span>显示区域</span>
              <div className="biliplayer-chips">
                {[
                  [0.25, "1/4 屏"],
                  [0.5, "半屏"],
                  [0.75, "3/4 屏"],
                  [1, "满屏"],
                ].map(([v, label]) => (
                  <button
                    key={String(v)}
                    className={prefs.danmaku.area === v ? "on" : undefined}
                    onClick={() => updateDanmaku({ area: v as number })}
                  >
                    {label as string}
                  </button>
                ))}
              </div>
            </div>
            <div className="biliplayer-field">
              <span>屏蔽</span>
              <div className="biliplayer-chips">
                <button
                  className={prefs.danmaku.blockScroll ? "on" : undefined}
                  onClick={() =>
                    updateDanmaku({ blockScroll: !prefs.danmaku.blockScroll })
                  }
                >
                  滚动
                </button>
                <button
                  className={prefs.danmaku.blockTop ? "on" : undefined}
                  onClick={() =>
                    updateDanmaku({ blockTop: !prefs.danmaku.blockTop })
                  }
                >
                  顶部
                </button>
                <button
                  className={prefs.danmaku.blockBottom ? "on" : undefined}
                  onClick={() =>
                    updateDanmaku({ blockBottom: !prefs.danmaku.blockBottom })
                  }
                >
                  底部
                </button>
              </div>
            </div>
          </div>
        )}

        {panel === "cc" && (
          <div className="biliplayer-panel">
            <h4>
              字幕
              <label className="biliplayer-switch">
                <input
                  type="checkbox"
                  checked={prefs.cc.on}
                  onChange={(e) => updateCc({ on: e.target.checked })}
                />
                <span>{prefs.cc.on ? "开" : "关"}</span>
              </label>
            </h4>
            <div className="biliplayer-field">
              <span>语言（可多选叠加）</span>
              <div className="biliplayer-chips">
                {tracks.map((t) => {
                  const on = activeTracks.some((a) => a.lan === t.lan);
                  return (
                    <button
                      key={t.lan}
                      className={on ? "on" : undefined}
                      onClick={() => {
                        const cur = prefsStore.get().cc.lans;
                        const next = cur.includes(t.lan)
                          ? cur.filter((l) => l !== t.lan)
                          : [...cur, t.lan];
                        updateCc({ lans: next, on: true });
                      }}
                      title={
                        t.suspect
                          ? "这条字幕的时间轴与视频对不上，多半是平台挂错了"
                          : t.ai
                            ? "平台自动生成，内容可能不准"
                            : undefined
                      }
                    >
                      {t.lanDoc}
                      {t.ai ? " · AI" : ""}
                      {t.suspect ? " ⚠" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
            {tracks.length > 1 && (
              <p className="biliplayer-panel-note">
                选中两条即可中英对照，第二条会显示得小一号。
              </p>
            )}
            {activeTracks.some((t) => t.suspect) && (
              <p className="biliplayer-panel-note">
                ⚠ 有字幕只覆盖了视频的一小段，bilibili 可能挂错了片源——内容对不上时请关掉它。
              </p>
            )}
            {activeTracks.some((t) => t.ai && !t.suspect) && (
              <p className="biliplayer-panel-note">
                标 AI 的字幕由 bilibili 自动生成，可能有错漏，仅供参考。
              </p>
            )}
            {onlyAiTracks && (
              <p className="biliplayer-panel-note">
                本集只有 AI 自动字幕。这类字幕常与画面对不上号（bilibili 有时会把
                别的视频的字幕挂过来），所以没有自动开启——需要的话在上面手动选一条。
              </p>
            )}
            <label className="biliplayer-slider">
              字号
              <input
                type="range"
                min={70}
                max={180}
                value={Math.round(prefs.cc.scale * 100)}
                onChange={(e) => updateCc({ scale: Number(e.target.value) / 100 })}
              />
              <b>{Math.round(prefs.cc.scale * 100)}%</b>
            </label>
            <label className="biliplayer-slider">
              位置
              <input
                type="range"
                min={2}
                max={35}
                value={Math.round(prefs.cc.bottom * 100)}
                onChange={(e) => updateCc({ bottom: Number(e.target.value) / 100 })}
              />
              <b>距底 {Math.round(prefs.cc.bottom * 100)}%</b>
            </label>
            <div className="biliplayer-field">
              <span>时间轴</span>
              <div className="biliplayer-chips">
                <button onClick={() => nudgeCcOffset(-500)}>-0.5s</button>
                <button
                  className="biliplayer-offset"
                  onClick={() => nudgeCcOffset(-ccOffset)}
                  title="点一下归零"
                >
                  {ccOffset === 0
                    ? "对齐"
                    : `${ccOffset > 0 ? "+" : ""}${(ccOffset / 1000).toFixed(1)}s`}
                </button>
                <button onClick={() => nudgeCcOffset(500)}>+0.5s</button>
              </div>
            </div>
            <p className="biliplayer-panel-note">
              字幕比人声慢就调正、快就调负。这个校准只对本视频生效，会记住。
            </p>
            <div className="biliplayer-field">
              <span>样式</span>
              <div className="biliplayer-chips">
                {[
                  ["shadow", "描边"],
                  ["box", "底框"],
                  ["plain", "纯文字"],
                ].map(([v, label]) => (
                  <button
                    key={v}
                    className={prefs.cc.style === v ? "on" : undefined}
                    onClick={() =>
                      updateCc({ style: v as PlayerPrefs["cc"]["style"] })
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {!payload.bound && (
        <p className="biliplayer-hint">
          绑定 bilibili 账号后可解锁高清晰度与 CC 字幕（当前{" "}
          {payload.qualityName || "标清"}）
        </p>
      )}

      <TermUnlockPopup terms={newTerms} onClose={() => setNewTerms([])} />
    </div>
  );
}
