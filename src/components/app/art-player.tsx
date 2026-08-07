"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Ref,
  useImperativeHandle,
} from "react";
import { createPortal } from "react-dom";
import { Loader2, NotebookPen, X } from "lucide-react";
import type Artplayer from "artplayer";
import type { Setting as ArtSetting } from "artplayer";
import type { MediaPlayerClass } from "dashjs";
import { reportWatchProgress, type WatchReport } from "@/lib/game/watch-actions";
import { addVideoNote } from "@/lib/game/notes-actions";
import {
  saveCcTrackOffset,
  savePlayerPrefs,
} from "@/lib/game/user-state-actions";
import { NOTES_CHANGED_EVENT } from "@/lib/notes-events";
import type { ToggleResult } from "@/lib/progress/actions";
import { announceSettle, rewardToast } from "@/lib/reward-feedback";
import { notifyQuestsChanged } from "@/lib/quest-events";
import { buildSegments, segmentCoverage } from "@/lib/segments";
import { TermUnlockPopup, type UnlockedTerm } from "./term-unlock-popup";
import { MarkdownEditor } from "./markdown-editor";
import { detectPlayMode } from "./player-capability";
import { prefsStore } from "./player-settings";

// bilibili 播放器,ArtPlayer(MIT)+ dash.js 组合:
//   · DASH 分片流交给 dash.js 走 MSE / ManagedMediaSource(iOS 17.1+),
//     1080P+、自适应码率、换清晰度不丢进度;老设备回退渐进 MP4
//   · 手势/全屏/横屏/锁屏/进度条/加载态全部用 ArtPlayer 的成熟实现
//   · 弹幕用官方 artplayer-plugin-danmuku(防重叠,设置面板自带)
//   · CC 字幕仍是自研 DOM 层:双语双行、per-user 时间轴偏移、
//     AI/可疑轨标记,这些 ArtPlayer 的单轨 VTT 引擎做不了
//   · 业务钩子不变:逐秒记录看过的秒;覆盖率 ≥90% 自动完成本集,
//     章节跨 90% 阶段性结算(每日打卡看完一章即算)

interface DashQuality {
  id: number;
  name: string;
  height: number | null;
}

interface Mp4Quality {
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
  viewPoints: { content: string; from: number; to: number }[];
  /** UP 主(credit 展示 + 关注入口) */
  owner?: { mid: number; name: string; face: string } | null;
  dash: { mpd: string; qualities: DashQuality[] } | null;
  progressive: { qualities: Mp4Quality[] } | null;
  error?: string;
}

interface SubtitleTrack {
  lan: string;
  lanDoc: string;
  cues: { from: number; to: number; text: string }[];
  ai: boolean;
  suspect: boolean;
}

export interface BiliPlayerHandle {
  /** 跳到绝对秒(知识点地图的时间戳跳转走这里) */
  seek: (seconds: number) => void;
  currentTime: () => number;
  /** 暂停(写笔记时自动暂停用) */
  pause: () => void;
}

/**
 * 字幕偏移数字输入(秒):本地暂存文本,让「0.8」这类能一位位敲进去,
 * 不被外部值回写打断;快捷 ±按钮/归零改了外部值时再同步过来。
 */
function CcOffsetInput({
  valueMs,
  onCommit,
}: {
  valueMs: number;
  onCommit: (seconds: number) => void;
}) {
  const [text, setText] = useState((valueMs / 1000).toString());
  const [prevMs, setPrevMs] = useState(valueMs);
  // 外部值变了(快捷 ±按钮/归零)才同步到输入框;渲染期调整而非 effect。
  // 只在与当前输入不等价时回写,避免敲「0.」时被抹成「0」。
  if (valueMs !== prevMs) {
    setPrevMs(valueMs);
    const cur = parseFloat(text);
    if (Number.isNaN(cur) || cur !== valueMs / 1000) {
      setText((valueMs / 1000).toString());
    }
  }
  return (
    <input
      type="number"
      step="0.1"
      inputMode="decimal"
      className="artccpanel-input"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseFloat(e.target.value);
        if (!Number.isNaN(n)) onCommit(n);
      }}
    />
  );
}

/** 读主题色给 ArtPlayer 当强调色 */
function accentColor(): string {
  if (typeof window === "undefined") return "#58cc02";
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue("--app-green")
      .trim() || "#58cc02"
  );
}

export function BiliPlayer({
  bvid,
  page,
  courseId,
  episodeN,
  resumeAt = 0,
  serverPrefs = null,
  keyPointMarks = [],
  onCompleted,
  onLoaded,
  ref,
}: {
  bvid: string;
  page: number;
  courseId: string;
  episodeN: number;
  resumeAt?: number;
  /** 服务端存的播放偏好 JSON(权威值,跨设备一致) */
  serverPrefs?: string | null;
  /** 本集 AI 分析里带时间戳的关键点(进度条刻度 + 分段边界) */
  keyPointMarks?: { t: number; title: string }[];
  onCompleted?: () => void;
  onLoaded?: (info: {
    aid: number;
    cid: number;
    owner?: { mid: number; name: string; face: string } | null;
  }) => void;
  ref?: Ref<BiliPlayerHandle>;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const artRef = useRef<Artplayer | null>(null);
  const dashRef = useRef<MediaPlayerClass | null>(null);

  const [payload, setPayload] = useState<PlayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tracks, setTracks] = useState<SubtitleTrack[]>([]);
  const [cues, setCues] = useState<string[]>([]);
  const [newTerms, setNewTerms] = useState<UnlockedTerm[]>([]);
  /** 按轨道的时间轴偏移(lan → ms);服务端已按 个人>旧全局>众包 合成 */
  const [ccOffsets, setCcOffsets] = useState<Record<string, number>>({});
  /** ArtPlayer 建好后暴露的层挂载点,React 往里 portal */
  const [ccHost, setCcHost] = useState<HTMLElement | null>(null);
  /** 字幕设置面板(双语主/副 + 数字偏移)的层挂载点与开合 */
  const [ccPanelHost, setCcPanelHost] = useState<HTMLElement | null>(null);
  const [ccPanelOpen, setCcPanelOpen] = useState(false);
  /** 章节面板(viewPoints 或分段) */
  const [chapterHost, setChapterHost] = useState<HTMLElement | null>(null);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [chapters, setChapters] = useState<{ title: string; from: number }[]>(
    [],
  );
  /** 章节缩略图:from 秒 → dataURL(前端抓帧,懒生成) */
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const thumbsStartedRef = useRef(false);
  /** 只在组件卸载时置真——面板开开关关不该腰斩生成 */
  const thumbsCancelRef = useRef(false);
  /** 全屏内的轻量奖励特效层(类抖音角标,不打断观看) */
  const [fxHost, setFxHost] = useState<HTMLElement | null>(null);
  const [fxItems, setFxItems] = useState<
    { id: number; text: string; tone: string }[]
  >([]);
  const fxSeq = useRef(0);
  /** 全屏中攒下的打卡结算,退出全屏再弹完整 popup/庆祝 */
  const deferredRef = useRef<{
    settle: ToggleResult;
    terms: UnlockedTerm[];
  } | null>(null);
  /** 视频笔记速记层(全屏可用) */
  const [noteHost, setNoteHost] = useState<HTMLElement | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteAt, setNoteAt] = useState(0);
  const [noteDraft, setNoteDraft] = useState("");
  const [notePreview, setNotePreview] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteMsg, setNoteMsg] = useState<string | null>(null);

  const prefs = useSyncExternalStore(
    prefsStore.subscribe,
    prefsStore.get,
    prefsStore.getServerSnapshot,
  );

  const seenRef = useRef<Set<number>>(new Set());
  const completedRef = useRef(false);
  const ccOffsetsRef = useRef<Record<string, number>>({});
  const lastCuesRef = useRef("");
  /** 画中画(canvas 合成):原生 PiP 只搬 video 画面,DOM 字幕层进不去。
      于是把「画面 + 当前双语字幕」逐帧画到 canvas,再把 canvas 流投进 PiP。
      音频仍来自页面里的原视频(它不暂停),字幕一定显示、样式自控。 */
  const pipOnRef = useRef(false);
  /** 控件点击时调用(实例建好后才有函数体) */
  const togglePipRef = useRef<(() => void) | null>(null);
  /** 卸载时收拾画中画(停 raf、断流、退出 PiP) */
  const pipCleanupRef = useRef<(() => void) | null>(null);
  const hoverRef = useRef(false);
  /** 实例还没建好时收到的 seek 请求,建好后补跳 */
  const pendingSeekRef = useRef<number | null>(null);
  /** 进度条刻度时间点(升序),「下一知识点」用 */
  const marksRef = useRef<number[]>([]);
  /** 覆盖率分段(与服务端 buildSegments 同一份纯函数,两边对齐) */
  const segmentsRef = useRef<ReturnType<typeof buildSegments>>([]);

  // 偏好:库里那份是权威,挂载时 hydrate 一次;之后每次改动落库
  useEffect(() => {
    prefsStore.bindPersist((json) => void savePlayerPrefs(json));
    prefsStore.hydrate(serverPrefs);
  }, [serverPrefs]);

  // 取播放地址(带能力检测结论)
  useEffect(() => {
    let cancelled = false;
    seenRef.current = new Set();
    completedRef.current = false;
    const mode = detectPlayMode();
    fetch(
      `/api/bili/play?bvid=${encodeURIComponent(bvid)}&page=${page}&mode=${mode}`,
    )
      .then((r) => r.json())
      .then((data: PlayPayload) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          return;
        }
        setPayload(data);
        onLoaded?.({ aid: data.aid, cid: data.cid, owner: data.owner });
      })
      .catch(() => {
        if (!cancelled) setError("播放地址解析失败");
      });
    return () => {
      cancelled = true;
    };
  }, [bvid, page, onLoaded]);

  // CC 字幕轨 + 本视频已存的时间轴偏移
  useEffect(() => {
    if (!payload?.cid) return;
    let cancelled = false;
    fetch(
      `/api/bili/subtitle?bvid=${encodeURIComponent(bvid)}&cid=${payload.cid}&duration=${payload.durationSec}&courseId=${encodeURIComponent(courseId)}&ep=${episodeN}`,
    )
      .then((r) => r.json())
      .then(
        (data: {
          tracks?: SubtitleTrack[];
          offsets?: Record<string, number>;
        }) => {
          if (cancelled) return;
          setTracks(data.tracks ?? []);
          const saved = data.offsets ?? {};
          setCcOffsets(saved);
          ccOffsetsRef.current = saved;
        },
      )
      .catch(() => {
        if (!cancelled) setTracks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [payload?.cid, payload?.durationSec, bvid, courseId, episodeN]);

  // 启用的字幕轨:用户选过就用选的;没选过自动挑人工轨(中文优先,
  // 中英都有就叠加双语)。只有 AI/可疑轨时不自动开——bilibili 的 AI
  // 字幕经常是别的视频的内容,自动挂上去只会误导人。
  const activeTracks = useMemo(() => {
    // 仓库轨(YouTube CC)的 lan 带 yt- 前缀,归一后按语言匹配
    const langOf = (lan: string) => lan.toLowerCase().replace(/^yt-/, "");
    if (tracks.length === 0) return [] as SubtitleTrack[];
    const byLan = new Map(tracks.map((t) => [t.lan, t]));
    // 选过就按 lans 顺序取(顺序即 主→副,主轨渲染在上、字号大);
    // 没选过就自动挑人工轨(中文优先,中英都有则叠加)。
    let picked: SubtitleTrack[];
    if (prefs.cc.lans.length > 0) {
      picked = prefs.cc.lans
        .map((l) => byLan.get(l))
        .filter((t): t is SubtitleTrack => !!t);
    } else {
      const human = tracks.filter((t) => !t.ai && !t.suspect);
      const zh = human.find((t) => langOf(t.lan).startsWith("zh"));
      const en = human.find((t) => langOf(t.lan).startsWith("en"));
      if (zh && en) picked = [zh, en];
      else if (zh) picked = [zh];
      else if (en) picked = [en];
      else if (human.length > 0) picked = [human[0]];
      else picked = [];
    }
    // 关双语只留主轨;开双语最多两条叠加
    return prefs.cc.bilingual ? picked.slice(0, 2) : picked.slice(0, 1);
  }, [tracks, prefs.cc.lans, prefs.cc.bilingual]);
  const activeTracksRef = useRef(activeTracks);
  useEffect(() => {
    activeTracksRef.current = activeTracks;
    lastCuesRef.current = "";
  }, [activeTracks]);

  /**
   * 调某条轨的字幕时间轴。立刻生效,落库防抖 600ms——按住 -0.5 连点时
   * 不该每下都写一次数据库。落库的这条记录同时是众包反馈。
   */
  const offsetSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cidRef = useRef<number | null>(null);
  cidRef.current = payload?.cid ?? null;
  /** 跳到下一个进度条刻度(章节/关键点) */
  const jumpNextMark = useCallback(() => {
    const art = artRef.current;
    if (!art) return;
    const next = marksRef.current.find((t) => t > art.currentTime + 1);
    if (next != null) {
      art.currentTime = next;
      void art.play();
    }
  }, []);

  /** 全屏内的轻量角标特效(类抖音):自动消失,不挡画面不打断播放 */
  const pushFx = useCallback((text: string, tone = "xp") => {
    const id = ++fxSeq.current;
    setFxItems((items) => [...items.slice(-4), { id, text, tone }]);
    setTimeout(() => {
      setFxItems((items) => items.filter((i) => i.id !== id));
    }, 3200);
  }, []);

  /** 奖励反馈分流:全屏 → 播放器内角标;非全屏 → 全局吐司 */
  const notifyReward = useCallback(
    (text: string, tone: "coin" | "xp" | "streak" | "review" | "lucky") => {
      const art = artRef.current;
      if (art && (art.fullscreen || art.fullscreenWeb)) pushFx(text, tone);
      else rewardToast({ text, tone });
    },
    [pushFx],
  );

  /** 打开笔记速记层:抓当前时间戳并暂停(全屏里也能记) */
  const openNote = useCallback(() => {
    const art = artRef.current;
    if (!art) return;
    setNoteAt(Math.floor(art.currentTime));
    setNoteMsg(null);
    setNotePreview(false);
    setNoteOpen(true);
    art.pause();
  }, []);

  /** 把某轨偏移落库(防抖 600ms),这条记录同时是众包反馈 */
  const persistOffset = useCallback((lan: string, ms: number) => {
    const cid = cidRef.current;
    if (!cid) return;
    if (offsetSaveRef.current) clearTimeout(offsetSaveRef.current);
    offsetSaveRef.current = setTimeout(() => {
      void saveCcTrackOffset(cid, lan, ms);
    }, 600);
  }, []);

  const nudgeCcOffset = useCallback(
    (lan: string, deltaMs: number) => {
      setCcOffsets((prev) => {
        const cur = prev[lan] ?? 0;
        const next =
          deltaMs === 0
            ? 0
            : Math.max(-30_000, Math.min(30_000, cur + deltaMs));
        const merged = { ...prev, [lan]: next };
        ccOffsetsRef.current = merged;
        persistOffset(lan, next);
        return merged;
      });
    },
    [persistOffset],
  );

  /** 直接设某轨的绝对偏移(秒),供数字输入用;支持 0.8 这类任意值 */
  const setCcOffsetAbs = useCallback(
    (lan: string, seconds: number) => {
      const ms = Math.max(-30_000, Math.min(30_000, Math.round(seconds * 1000)));
      setCcOffsets((prev) => {
        const merged = { ...prev, [lan]: ms };
        ccOffsetsRef.current = merged;
        persistOffset(lan, ms);
        return merged;
      });
    },
    [persistOffset],
  );

  // ==== 建 ArtPlayer 实例 ====
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !payload) return;
    if (!payload.dash && !payload.progressive?.qualities.length) {
      setError("没有可用的视频流");
      return;
    }
    let cancelled = false;
    let art: Artplayer | null = null;

    (async () => {
      const [{ default: ArtplayerCtor }, { default: danmukuPlugin }] =
        await Promise.all([
          import("artplayer"),
          import("artplayer-plugin-danmuku"),
        ]);
      if (cancelled || !hostRef.current) return;

      // 「上次看到」小条默认在首个 timeupdate 的 3 秒后自动隐藏,
      // 但加载/seek 阶段就可能触发一次 timeupdate,窗口稍纵即逝——放宽到 10 秒
      ArtplayerCtor.AUTO_PLAYBACK_TIMEOUT = 10_000;

      const p = prefsStore.get();
      const isDash = !!payload.dash;
      const mp4Qualities = payload.progressive?.qualities ?? [];
      const mp4Picked =
        mp4Qualities.find((q) => q.id === p.qualityId) ?? mp4Qualities[0];

      // React 往这些层里 portal 自研 UI(CC 字幕/章节面板),
      // 挂在播放器内部才能在全屏时可见
      const ccEl = document.createElement("div");
      ccEl.className = "artcc-host";
      const ccPanelEl = document.createElement("div");
      ccPanelEl.className = "artccpanel-host";
      const chapterEl = document.createElement("div");
      chapterEl.className = "artchapter-host";
      const fxEl = document.createElement("div");
      fxEl.className = "artfx-host";
      const noteEl = document.createElement("div");
      noteEl.className = "artnote-host";

      // 进度条刻度 = UP 主章节 ∪ AI 关键点(5 秒内视为同一处,章节优先)
      const marks: { time: number; text: string }[] = payload.viewPoints.map(
        (v) => ({ time: v.from, text: v.content }),
      );
      for (const kp of keyPointMarks) {
        if (!marks.some((m) => Math.abs(m.time - kp.t) < 5)) {
          marks.push({ time: kp.t, text: kp.title });
        }
      }
      marks.sort((a, b) => a.time - b.time);
      marksRef.current = marks.map((m) => m.time);

      // 覆盖率分段:只用 keyPoints/等分(服务端 chips 同款输入,两边一致)
      segmentsRef.current = buildSegments({
        durationSec: payload.durationSec,
        keyPoints: keyPointMarks,
      });

      // 章节面板数据:章节优先,其次覆盖率分段
      setChapters(
        payload.viewPoints.length > 0
          ? payload.viewPoints.map((v) => ({ title: v.content, from: v.from }))
          : segmentsRef.current.map((s) => ({ title: s.title, from: s.from })),
      );

      art = new ArtplayerCtor({
        container: hostRef.current,
        // autoPlayback 的进度记忆按这个 id 存取(默认用 url,但直链会过期变化)
        id: `${bvid}:${page}`,
        url: isDash ? payload.dash!.mpd : mp4Picked.url,
        // mp4 不设 type,走浏览器原生;只有 mpd 需要 customType 接管
        ...(isDash ? { type: "mpd" as const } : {}),
        customType: {
          mpd: async (video: HTMLVideoElement, rawUrl: string) => {
            // dash.js 的 CMCD 模块会拿这个地址去 new URL(),相对路径会炸
            const url = new URL(rawUrl, window.location.href).toString();
            const dashjs = await import("dashjs");
            const player = dashjs.MediaPlayer().create();
            player.updateSettings({
              streaming: {
                // 手动切清晰度时直接替换缓冲区,立刻见效(不等旧档播完)
                buffer: { fastSwitchEnabled: true },
                abr: {
                  autoSwitchBitrate: { video: prefsStore.get().autoQuality },
                },
              },
            });
            player.initialize(video, url, false);
            dashRef.current = player;

            // 手动挑过清晰度的用户,流一建好就按住那一档
            player.on("streamInitialized", () => {
              const cur = prefsStore.get();
              if (!cur.autoQuality && cur.qualityId != null) {
                try {
                  player.setRepresentationForTypeById(
                    "video",
                    `v${cur.qualityId}`,
                  );
                } catch {
                  // 该档位不存在就随 ABR
                }
              }
            });

            // bilibili 直链约 2 小时过期。播放中途下载报错时重拉 MPD
            // (每次请求都是新鲜直链),并把进度接回去;10 秒内不重复试。
            let lastReattach = 0;
            player.on("error", () => {
              const now = Date.now();
              if (now - lastReattach < 10_000) return;
              lastReattach = now;
              const at = video.currentTime;
              try {
                player.attachSource(url);
                player.on("streamInitialized", function once() {
                  player.off("streamInitialized", once);
                  if (at > 0) video.currentTime = at;
                });
              } catch {
                // 重连失败让 ArtPlayer 报错 UI 兜着
              }
            });
          },
        },
        // mp4 模式的清晰度用 ArtPlayer 原生列表(切换自动保进度);
        // dash 模式的清晰度在设置菜单里调 dash.js,同一 MSE 会话不丢进度
        quality: isDash
          ? []
          : mp4Qualities.map((q) => ({
              html: q.name,
              url: q.url,
              default: q.id === mp4Picked.id,
            })),
        volume: p.volume,
        muted: p.muted,
        playsInline: true,
        autoplay: false,
        autoSize: false,
        autoMini: false,
        mutex: true,
        backdrop: true,
        setting: true,
        hotkey: false, // 自己接管:要支持「悬停即可用键盘」,ArtPlayer 的须先点击聚焦
        pip: false, // 用自研 canvas 合成 PiP(带字幕),不用原生的

        airplay: false,
        fullscreen: true,
        fullscreenWeb: true,
        miniProgressBar: true,
        playbackRate: true,
        // 续播用 ArtPlayer 内建的「上次看到」小条(位置由它按控制栏排布,
        // 不会被组件挡住);服务端的跨设备进度在下面种进它的 storage
        autoPlayback: true,
        lock: true,
        gesture: true,
        fastForward: true,
        autoOrientation: true, // 手机竖屏点网页全屏 → 自动转 90°(iOS 也适用)
        theme: accentColor(),
        lang: "zh-cn",
        // 进度条刻度:章节 + 关键点,悬停出标题,点击即跳
        highlight: marks,
        layers: [
          { name: "cc", html: ccEl },
          { name: "ccpanel", html: ccPanelEl },
          { name: "chapters", html: chapterEl },
          { name: "fx", html: fxEl },
          { name: "note", html: noteEl },
        ],
        // 右侧控件从简:下一知识点只留 n 键(按钮太多会溢出),
        // PIP 同理砍掉;章节/覆盖率/笔记是高频入口才上按钮
        controls: [
          ...(payload.viewPoints.length > 0 || segmentsRef.current.length > 0
            ? [
                {
                  name: "chapters",
                  position: "right" as const,
                  index: 4,
                  tooltip: "章节",
                  html: `<span class="artp-chapters">章</span>`,
                  click: () => {
                    setChaptersOpen((open) => !open);
                  },
                },
              ]
            : []),
          {
            // 字幕设置:双语主/副 + 每轨时间轴数字偏移(单独控件,点开 React 面板)
            name: "ccsettings",
            position: "right",
            index: 5,
            tooltip: "字幕设置",
            html: `<span class="artp-ccbtn">CC</span>`,
            click: () => {
              setCcPanelOpen((open) => !open);
            },
          },
          {
            // 时间戳笔记:全屏里也能随手记(b 键同款)
            name: "note",
            position: "right",
            index: 6,
            tooltip: "记笔记(b)",
            html: `<span class="artp-notebtn">✎</span>`,
            click: () => {
              openNote();
            },
          },
          {
            // 画中画(canvas 合成,带字幕)
            name: "canvaspip",
            position: "right",
            index: 7,
            tooltip: "画中画",
            html: `<span class="artp-pipbtn">⧉</span>`,
            click: () => {
              togglePipRef.current?.();
            },
          },
        ],
        settings: buildSettings(isDash, payload.dash?.qualities ?? []),
        plugins: [
          danmukuPlugin({
            danmuku: () =>
              fetch(`/api/bili/danmaku?cid=${payload.cid}`)
                .then((r) => r.json())
                .then(
                  (data: {
                    danmaku?: {
                      t: number;
                      mode: number;
                      color: number;
                      text: string;
                    }[];
                  }) =>
                    (data.danmaku ?? []).map((d) => ({
                      text: d.text,
                      time: d.t,
                      color: `#${d.color.toString(16).padStart(6, "0")}`,
                      mode: (d.mode === 5 ? 1 : d.mode === 4 ? 2 : 0) as
                        | 0
                        | 1
                        | 2,
                    })),
                ),
            // 学习场景不发弹幕,只看
            emitter: false,
            visible: p.danmaku.on,
            opacity: p.danmaku.opacity,
            // 字号用画面高度的百分比,全屏时自动跟着放大
            fontSize: `${(4.5 * p.danmaku.scale).toFixed(1)}%` as `${number}%`,
            // 插件的 speed 是「穿屏耗时(秒)」,和旧偏好的倍率反着来
            speed: Math.max(1, Math.min(10, Math.round(8 / p.danmaku.speed))),
            margin: [8, `${Math.round((1 - p.danmaku.area) * 100)}%`] as [
              number,
              `${number}%`,
            ],
            antiOverlap: true,
            synchronousPlayback: true,
          }),
        ],
      });

      artRef.current = art;
      setCcHost(ccEl);
      setCcPanelHost(ccPanelEl);
      setChapterHost(chapterEl);
      setFxHost(fxEl);
      setNoteHost(noteEl);

      // 全屏中攒下的完整反馈(庆祝/卷宗弹窗)在退出全屏时统一补发——
      // 观看中只给角落轻特效,不打断;退出即结算,反馈也不丢
      const flushDeferred = () => {
        const d = deferredRef.current;
        if (!d) return;
        deferredRef.current = null;
        announceSettle(d.settle);
        if (d.terms.length > 0) setNewTerms(d.terms);
      };
      art.on("fullscreen", (on: boolean) => {
        if (!on) flushDeferred();
      });
      art.on("fullscreenWeb", (on: boolean) => {
        if (!on) flushDeferred();
      });

      // 服务端存的跨设备进度种进 autoPlayback 的 storage(取两边的较大值),
      // ready 时它会读这个键弹出「上次看到 X · 跳转播放」小条
      if (resumeAt > 5) {
        try {
          const times =
            (art.storage.get("times") as Record<string, number> | undefined) ??
            {};
          const key = `${bvid}:${page}`;
          if ((times[key] ?? 0) < resumeAt) {
            times[key] = resumeAt;
            art.storage.set("times", times);
          }
        } catch {
          // storage 不可用(隐私模式)就没有续播提示,不影响播放
        }
      }

      art.on("ready", () => {
        const cur = prefsStore.get();
        art!.playbackRate = cur.rate;
        // 实例建成前收到过 seek(知识点跨集跳转)就补上
        const pending = pendingSeekRef.current;
        if (pending != null) {
          pendingSeekRef.current = null;
          art!.currentTime = Math.max(0, pending);
          void art!.play();
        }
      });

      // 播放中的偏好改动写回 prefs(音量/静音/倍速),跨集跨设备记住
      art.on("video:volumechange", () => {
        const cur = prefsStore.get();
        if (
          art &&
          (Math.abs(cur.volume - art.volume) > 0.001 || cur.muted !== art.muted)
        ) {
          prefsStore.set({ volume: art.volume, muted: art.muted });
        }
      });
      art.on("video:ratechange", () => {
        const cur = prefsStore.get();
        if (art && art.playbackRate !== cur.rate && art.playbackRate > 0) {
          prefsStore.set({ rate: art.playbackRate });
        }
      });
      // 弹幕开关(插件自带按钮或 d 键)→ 记进偏好,跨集跨设备保持
      art.on("artplayerPluginDanmuku:show", () => {
        if (!prefsStore.get().danmaku.on) {
          prefsStore.set({ danmaku: { ...prefsStore.get().danmaku, on: true } });
        }
      });
      art.on("artplayerPluginDanmuku:hide", () => {
        if (prefsStore.get().danmaku.on) {
          prefsStore.set({
            danmaku: { ...prefsStore.get().danmaku, on: false },
          });
        }
      });

      // 画中画(canvas 合成):把「原视频画面 + 当前双语字幕」逐帧画到
      // 离屏 canvas,再把 canvas.captureStream 投进 PiP。原视频不暂停,
      // 音频照常;PiP 小窗里字幕一定显示、样式自控(代价:小窗只有播放/暂停)。
      const srcVideo = art.video;
      const pipVideo = document.createElement("video");
      pipVideo.muted = true;
      pipVideo.playsInline = true;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      let rafId = 0;

      const currentCcText = () => {
        if (!prefsStore.get().cc.on) return "";
        const t = srcVideo.currentTime;
        return activeTracksRef.current
          .map((track) => {
            const at = t - (ccOffsetsRef.current[track.lan] ?? 0) / 1000;
            return track.cues.find((c) => at >= c.from && at <= c.to)?.text ?? "";
          })
          .filter(Boolean)
          .join("\n");
      };

      const drawSubtitle = (text: string) => {
        if (!ctx || !text) return;
        const lines = text.split("\n");
        const base = Math.round(canvas.height * 0.05); // 字号随分辨率缩放
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.lineJoin = "round";
        let y = canvas.height - Math.round(canvas.height * 0.04);
        // 从下往上画(主字幕在上、略大),与页面内叠加顺序一致
        for (let i = lines.length - 1; i >= 0; i--) {
          const size = i === 0 ? base : Math.round(base * 0.86);
          ctx.font = `700 ${size}px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif`;
          ctx.lineWidth = Math.max(3, size * 0.14);
          ctx.strokeStyle = "rgba(0,0,0,0.85)";
          ctx.fillStyle = "#fff";
          ctx.strokeText(lines[i], canvas.width / 2, y);
          ctx.fillText(lines[i], canvas.width / 2, y);
          y -= size * 1.3;
        }
      };

      const drawFrame = () => {
        if (ctx && srcVideo.videoWidth) {
          if (canvas.width !== srcVideo.videoWidth) {
            canvas.width = srcVideo.videoWidth;
            canvas.height = srcVideo.videoHeight;
          }
          ctx.drawImage(srcVideo, 0, 0, canvas.width, canvas.height);
          drawSubtitle(currentCcText());
        }
        rafId = requestAnimationFrame(drawFrame);
      };

      const stopPip = () => {
        pipOnRef.current = false;
        cancelAnimationFrame(rafId);
        rafId = 0;
        if (document.pictureInPictureElement === pipVideo) {
          document.exitPictureInPicture().catch(() => {});
        }
        const s = pipVideo.srcObject as MediaStream | null;
        if (s) s.getTracks().forEach((t) => t.stop());
        pipVideo.srcObject = null;
      };

      const startPip = async () => {
        if (pipOnRef.current || !ctx || !srcVideo.videoWidth) return;
        canvas.width = srcVideo.videoWidth;
        canvas.height = srcVideo.videoHeight;
        drawFrame();
        pipVideo.srcObject = canvas.captureStream(30);
        try {
          await pipVideo.play();
          await pipVideo.requestPictureInPicture();
          pipOnRef.current = true;
        } catch {
          stopPip(); // 用户拒绝 / 不支持 → 收拾干净
        }
      };

      togglePipRef.current = () => {
        if (pipOnRef.current) stopPip();
        else void startPip();
      };
      pipCleanupRef.current = stopPip;

      // PiP 小窗的播放/暂停镜像回原视频(保持音画同步)
      pipVideo.addEventListener("play", () => {
        if (srcVideo.paused) void srcVideo.play();
      });
      pipVideo.addEventListener("pause", () => {
        if (!srcVideo.paused) srcVideo.pause();
      });
      pipVideo.addEventListener("leavepictureinpicture", () => stopPip());

      // 覆盖率追踪 + CC 字幕行,都挂在 timeupdate 上
      // (覆盖率百分比不再占控制栏按钮位,分段 chips 与打卡反馈足够)
      art.on("video:timeupdate", () => {
        if (!art) return;
        const t = art.currentTime;
        seenRef.current.add(Math.floor(t));
        // 正偏移 = 字幕延后出现,查表时把时间轴往回拨(每轨独立:
        // 中文对齐、英文轨慢半秒是常态,一个全局偏移调不动)
        if (prefsStore.get().cc.on && activeTracksRef.current.length > 0) {
          const next = activeTracksRef.current.map((track) => {
            const at = t - (ccOffsetsRef.current[track.lan] ?? 0) / 1000;
            return (
              track.cues.find((c) => at >= c.from && at <= c.to)?.text ?? ""
            );
          });
          const key = next.join("");
          if (key !== lastCuesRef.current) {
            lastCuesRef.current = key;
            setCues(next);
          }
        } else if (lastCuesRef.current !== "") {
          lastCuesRef.current = "";
          setCues([]);
        }
      });

      // 悬停状态给键盘控制用
      const el = art.template?.$container as HTMLElement | undefined;
      el?.addEventListener("pointerenter", () => (hoverRef.current = true));
      el?.addEventListener("pointerleave", () => (hoverRef.current = false));
    })();

    return () => {
      cancelled = true;
      setCcHost(null);
      setCcPanelHost(null);
      setCcPanelOpen(false);
      setChapterHost(null);
      setChaptersOpen(false);
      setFxHost(null);
      setNoteHost(null);
      setNoteOpen(false);
      thumbsStartedRef.current = false;
      setThumbs({});
      deferredRef.current = null;
      pipCleanupRef.current?.();
      pipCleanupRef.current = null;
      togglePipRef.current = null;
      pipOnRef.current = false;
      try {
        dashRef.current?.destroy();
      } catch {
        // 已销毁就算了
      }
      dashRef.current = null;
      try {
        art?.destroy(true);
      } catch {
        // 同上
      }
      artRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 实例只随视频本身重建;偏好类改动走下面的小 effect,不推倒重来
  }, [payload]);

  /** 设置菜单:清晰度(dash)/ CC 字幕 / 离开暂停。弹幕设置由官方插件自带。 */
  function buildSettings(
    isDash: boolean,
    dashQualities: DashQuality[],
  ): ArtSetting[] {
    const settings: ArtSetting[] = [];
    if (isDash && dashQualities.length > 0) {
      const p = prefsStore.get();
      settings.push({
        html: "清晰度",
        width: 220,
        tooltip: p.autoQuality
          ? "自动"
          : (dashQualities.find((q) => q.id === p.qualityId)?.name ?? "自动"),
        selector: [
          {
            html: "自动(按网速)",
            default: p.autoQuality,
            qid: null,
          },
          ...dashQualities.map((q) => ({
            html: q.name,
            default: !p.autoQuality && p.qualityId === q.id,
            qid: q.id,
          })),
        ],
        onSelect: (item) => {
          const qid = item.qid as number | null;
          const dash = dashRef.current;
          if (qid == null) {
            prefsStore.set({ autoQuality: true });
            dash?.updateSettings({
              streaming: { abr: { autoSwitchBitrate: { video: true } } },
            });
            return "自动";
          }
          prefsStore.set({ autoQuality: false, qualityId: qid });
          dash?.updateSettings({
            streaming: { abr: { autoSwitchBitrate: { video: false } } },
          });
          try {
            dash?.setRepresentationForTypeById("video", `v${qid}`);
          } catch {
            // 档位不存在就保持现状
          }
          return String(item.html);
        },
      });
    }

    settings.push({
      html: "离开页面自动暂停",
      tooltip: prefsStore.get().pauseOnBlur ? "开" : "关",
      switch: prefsStore.get().pauseOnBlur,
      onSwitch: (item) => {
        const next = !item.switch;
        prefsStore.set({ pauseOnBlur: next });
        return next;
      },
    });
    return settings;
  }

  // CC 字幕设置改走 React 面板(设置菜单「字幕设置」→ ccPanelOpen),
  // 双语主/副选择 + 每轨数字偏移,ArtPlayer 菜单塞不下这些控件。

  // 倍速偏好变化 → 应用到播放器(设置菜单里改的走 ratechange 已同步)
  useEffect(() => {
    const art = artRef.current;
    if (art && art.playbackRate !== prefs.rate) art.playbackRate = prefs.rate;
  }, [prefs.rate, ccHost]);

  // 切走标签页 / 窗口失焦自动暂停(全屏时不管,可在设置里关)
  useEffect(() => {
    if (!payload || !prefs.pauseOnBlur) return;
    const pause = () => {
      const art = artRef.current;
      if (!art || art.fullscreen || art.fullscreenWeb) return;
      if (art.playing) art.pause();
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

  // 定时上报观看进度;≥90% 自动打卡时报出新解锁的词条
  useEffect(() => {
    if (!payload) return;
    const send = async () => {
      const art = artRef.current;
      const total = art?.duration || payload.durationSec || 0;
      if (!art || total <= 0 || seenRef.current.size === 0) return;
      const r: WatchReport = await reportWatchProgress(
        courseId,
        episodeN,
        art.currentTime,
        total,
        seenRef.current.size,
        // 分段覆盖率(长视频才有段;服务端逐段取大合并)
        segmentsRef.current.length > 0
          ? segmentCoverage(seenRef.current, segmentsRef.current)
          : undefined,
      );

      // 章节阶段性奖励:小额高频,全屏走角标特效、页面走吐司
      if (r.segments) {
        for (const s of r.segments.settles) {
          notifyReward(`📚 ${s.title} · +${s.xp} XP`, "xp");
        }
        if (r.segments.chestCoins > 0) {
          notifyReward(
            `🎁 章节连击宝箱 +${r.segments.chestCoins} 金币`,
            "coin",
          );
        }
        if (r.segments.potionAwarded) {
          notifyReward("🧪 章节里程碑:经验药水 ×1.5 入包", "lucky");
        }
        const st = r.segments.streak;
        if (st?.changed && st.current > 1) {
          notifyReward(`🔥 连续学习 ${st.current} 天`, "streak");
        }
      }

      if (r.completed && !completedRef.current) {
        completedRef.current = true;
        // 看完一集可能推进「今天看完一集」任务 → 触发完成特效 diff
        notifyQuestsChanged();
        const terms = r.settle?.unlockedTerms ?? [];
        const fullscreen = art.fullscreen || art.fullscreenWeb;
        if (fullscreen) {
          // 全屏观看中不弹大窗:角落轻特效即时确认,完整反馈
          // (庆祝动效 + 卷宗弹窗)攒到退出全屏统一补发
          if (r.settle) deferredRef.current = { settle: r.settle, terms };
          const xp = r.settle?.gained ?? 0;
          pushFx(`✅ 本集完成${xp > 0 ? ` +${xp} XP` : ""}`, "xp");
          if (terms.length > 0) pushFx(`📜 卷宗解锁 ×${terms.length}`, "lucky");
        } else {
          // 自动打卡的主路径也要有完整反馈:XP/金币/彩蛋/连胜/升级庆祝
          if (r.settle) announceSettle(r.settle);
          if (terms.length > 0) setNewTerms(terms);
        }
        onCompleted?.();
      }
    };
    // 10 秒一次:进度落库要够密,否则「上次看到哪」会差一截
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
  }, [payload, courseId, episodeN, onCompleted, notifyReward, pushFx]);

  // 防疲劳:累计「连续播放」时长,到阈值温和提醒起来动一动。
  // 连续 = 没有真正休息过;暂停超过 5 分钟视为休息一次,计时归零。
  // 只提醒、不打断播放(全屏也只出角落轻特效),健康优先于沉浸。
  useEffect(() => {
    if (!payload) return;
    const REST_MS = 50 * 60_000; // 50 分钟:该起来活动一下
    const HARD_MS = 90 * 60_000; // 90 分钟:强烈建议休息
    const BREAK_MS = 5 * 60_000; // 累计暂停 5 分钟算真正休息过,计时归零
    let contMs = 0;
    let pausedMs = 0;
    let lastTick = Date.now();
    const fired = new Set<number>();

    const remind = (text: string) => {
      const art = artRef.current;
      if (art && (art.fullscreen || art.fullscreenWeb)) pushFx(text, "review");
      else rewardToast({ text, tone: "review" });
    };

    // 20s 一跳(不依赖 art 事件,避开实例异步创建的竞态):
    // 播放中累加连续时长;暂停累计够久就当休息过、清零重来
    const timer = setInterval(() => {
      const art = artRef.current;
      const now = Date.now();
      const dt = now - lastTick;
      lastTick = now;
      if (art?.playing) {
        pausedMs = 0;
        contMs += dt;
        if (contMs >= HARD_MS && !fired.has(HARD_MS)) {
          fired.add(HARD_MS);
          remind("🧠 已连续学习 90 分钟,大脑需要休息才能巩固,去走走吧");
        } else if (contMs >= REST_MS && !fired.has(REST_MS)) {
          fired.add(REST_MS);
          remind("⏸️ 连续学了 50 分钟,起来动一动、喝口水,记得更牢");
        }
      } else {
        pausedMs += dt;
        if (pausedMs >= BREAK_MS) {
          contMs = 0;
          fired.clear();
        }
      }
    }, 20_000);

    return () => clearInterval(timer);
  }, [payload, pushFx]);

  // 键盘控制。只在鼠标停在播放器上、全屏中、或播放器内有焦点时接管——
  // 否则在页面别处敲空格会莫名其妙地暂停视频。
  // (不用 ArtPlayer 内建 hotkey:它要求先点击播放器聚焦,悬停不算)
  useEffect(() => {
    if (!payload) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const art = artRef.current;
      if (!art) return;
      const container = art.template?.$container as HTMLElement | undefined;
      const inPlayer =
        hoverRef.current ||
        art.fullscreen ||
        art.fullscreenWeb ||
        (container?.contains(document.activeElement) ?? false);
      if (!inPlayer) return;

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          art.toggle();
          break;
        case "ArrowLeft":
          e.preventDefault();
          art.backward = e.shiftKey ? 30 : 5;
          break;
        case "ArrowRight":
          e.preventDefault();
          art.forward = e.shiftKey ? 30 : 5;
          break;
        case "ArrowUp":
          e.preventDefault();
          art.volume = Math.min(1, art.volume + 0.1);
          art.muted = false;
          break;
        case "ArrowDown": {
          e.preventDefault();
          const next = Math.max(0, art.volume - 0.1);
          art.volume = next;
          if (next === 0) art.muted = true;
          break;
        }
        case "m":
          art.muted = !art.muted;
          break;
        case "f":
          art.fullscreen = !art.fullscreen;
          break;
        case "n":
          jumpNextMark();
          break;
        case "b":
          openNote();
          break;
        case "c": {
          const cur = prefsStore.get().cc;
          prefsStore.set({ cc: { ...cur, on: !cur.on } });
          break;
        }
        case "d": {
          // 等效于点插件自带的弹幕开关(prefs 同步走 show/hide 事件)
          const plugin = (
            art.plugins as unknown as {
              artplayerPluginDanmuku?: {
                isHide: boolean;
                show: () => void;
                hide: () => void;
              };
            }
          ).artplayerPluginDanmuku;
          if (plugin) {
            if (plugin.isHide) plugin.show();
            else plugin.hide();
          }
          break;
        }
        default:
          // 数字键跳到对应百分比,跟主流播放器一致
          if (/^[0-9]$/.test(e.key)) {
            const total = art.duration;
            if (total > 0) art.currentTime = (total * Number(e.key)) / 10;
          }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [payload, jumpNextMark, openNote]);

  // 组件卸载才取消缩略图生成(换集时外层 key 变化必定卸载重挂)
  useEffect(() => {
    thumbsCancelRef.current = false;
    return () => {
      thumbsCancelRef.current = true;
    };
  }, []);

  // 章节缩略图:面板首次展开时才生成(懒)。取最低清晰度的渐进流
  // (同源代理,canvas 不受污染),隐藏 video 逐章 seek 抓帧;
  // seeked 后再等一帧真正解码(requestVideoFrameCallback)才画,
  // 否则抓到的是黑帧。纯锦上添花:失败静默放弃,面板退回纯文字。
  useEffect(() => {
    if (!chaptersOpen || thumbsStartedRef.current || chapters.length === 0) {
      return;
    }
    thumbsStartedRef.current = true;
    const video = document.createElement("video");
    (async () => {
      try {
        const res = await fetch(
          `/api/bili/play?bvid=${encodeURIComponent(bvid)}&page=${page}&mode=mp4`,
        );
        const data = (await res.json()) as {
          progressive?: { qualities: { url: string }[] } | null;
        };
        const qualities = data.progressive?.qualities ?? [];
        if (qualities.length === 0) return;
        // bilibili 返回按清晰度降序,末位最低——缩略图够用还省流量
        video.muted = true;
        video.preload = "auto";
        video.playsInline = true;
        video.src = qualities[qualities.length - 1].url;
        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => resolve();
          video.onerror = () => reject(new Error("load"));
          setTimeout(() => reject(new Error("timeout")), 15_000);
        });
        const ratio = video.videoWidth / Math.max(1, video.videoHeight);
        const canvas = document.createElement("canvas");
        canvas.width = 168;
        canvas.height = Math.max(64, Math.round(168 / (ratio || 16 / 9)));
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        for (const c of chapters) {
          if (thumbsCancelRef.current) return;
          await new Promise<void>((resolve) => {
            let settled = false;
            const finish = () => {
              if (settled) return;
              settled = true;
              resolve();
            };
            const onSeeked = () => {
              video.removeEventListener("seeked", onSeeked);
              // seeked 只保证位置,还要等帧真正呈现
              const withFrame = (
                video as HTMLVideoElement & {
                  requestVideoFrameCallback?: (cb: () => void) => void;
                }
              ).requestVideoFrameCallback;
              if (withFrame) withFrame.call(video, finish);
              else setTimeout(finish, 150);
            };
            video.addEventListener("seeked", onSeeked);
            // 章节起点常是黑场转场,进 2 秒再抓更有内容
            video.currentTime = Math.min(
              c.from + 2,
              Math.max(0, (video.duration || c.from + 2) - 0.5),
            );
            setTimeout(finish, 6000);
          });
          if (thumbsCancelRef.current) return;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const url = canvas.toDataURL("image/jpeg", 0.62);
          setThumbs((t) => ({ ...t, [c.from]: url }));
        }
      } catch {
        // 拿不到就不显示缩略图
      } finally {
        video.removeAttribute("src");
        video.load();
      }
    })();
  }, [chaptersOpen, chapters, bvid, page]);

  useImperativeHandle(
    ref,
    (): BiliPlayerHandle => ({
      seek: (seconds: number) => {
        const art = artRef.current;
        if (!art) {
          // 实例还没建好(刚切集):记下来,ready 时补跳
          pendingSeekRef.current = seconds;
          return;
        }
        const apply = () => {
          art.currentTime = Math.max(0, seconds);
          void art.play();
        };
        if (art.isReady) apply();
        else art.once("ready", apply);
      },
      currentTime: () => artRef.current?.currentTime ?? 0,
      pause: () => artRef.current?.pause(),
    }),
    [],
  );

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

  return (
    <div className="biliplayer-art-wrap">
      <div ref={hostRef} className="biliplayer-art" />

      {/* CC 字幕:portal 进播放器内部的层,全屏也可见 */}
      {ccHost &&
        prefs.cc.on &&
        cues.some(Boolean) &&
        createPortal(
          <div
            className={`biliplayer-cc style-${prefs.cc.style}`}
            style={{ bottom: `${prefs.cc.bottom * 100}%` }}
          >
            {cues.map((text, i) =>
              text ? (
                <span
                  key={activeTracks[i]?.lan ?? i}
                  // 叠加时第二条起略小一点,主次分明
                  style={{
                    fontSize: `${prefs.cc.scale * (i === 0 ? 100 : 86)}%`,
                  }}
                >
                  {text}
                </span>
              ) : null,
            )}
          </div>,
          ccHost,
        )}

      {/* 字幕设置面板(设置菜单「字幕设置」展开):bilibili 式双语主/副
          选择 + 每轨时间轴数字偏移。portal 进播放器层,全屏也可用 */}
      {ccPanelHost &&
        ccPanelOpen &&
        (() => {
          const trackLabel = (t: SubtitleTrack) =>
            t.lanDoc + (t.ai ? " · AI" : "") + (t.suspect ? " ⚠" : "");
          const mainLan = activeTracks[0]?.lan ?? "";
          const subLan = activeTracks[1]?.lan ?? "";
          const cc = prefs.cc;
          const setLans = (arr: string[]) =>
            prefsStore.set({
              cc: { ...prefsStore.get().cc, lans: arr.filter(Boolean), on: true },
            });
          return createPortal(
            <div className="artccpanel" onClick={(e) => e.stopPropagation()}>
              <header>
                <b>字幕设置</b>
                <button
                  onClick={() => setCcPanelOpen(false)}
                  aria-label="关闭"
                  type="button"
                >
                  <X size={18} strokeWidth={2.6} aria-hidden />
                </button>
              </header>
              {tracks.length === 0 ? (
                <p className="artccpanel-empty">这个视频没有可用字幕</p>
              ) : (
                <>
                  <label className="artccpanel-row artccpanel-switch">
                    <span>显示字幕</span>
                    <input
                      type="checkbox"
                      checked={cc.on}
                      onChange={(e) =>
                        prefsStore.set({
                          cc: { ...prefsStore.get().cc, on: e.target.checked },
                        })
                      }
                    />
                  </label>
                  <label className="artccpanel-row artccpanel-switch">
                    <span>双语字幕</span>
                    <input
                      type="checkbox"
                      checked={cc.bilingual}
                      onChange={(e) => {
                        const on = e.target.checked;
                        const prev = prefsStore.get().cc;
                        // 关双语:只留主轨
                        const lans = on
                          ? prev.lans
                          : mainLan
                            ? [mainLan]
                            : [];
                        prefsStore.set({ cc: { ...prev, bilingual: on, lans } });
                      }}
                    />
                  </label>

                  {cc.bilingual ? (
                    <>
                      <label className="artccpanel-row">
                        <span>主字幕</span>
                        <select
                          value={mainLan}
                          onChange={(e) => {
                            const m = e.target.value;
                            const s = subLan && subLan !== m ? subLan : "";
                            setLans([m, s]);
                          }}
                        >
                          {tracks.map((t) => (
                            <option key={t.lan} value={t.lan}>
                              {trackLabel(t)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="artccpanel-row">
                        <span>副字幕</span>
                        <select
                          value={subLan}
                          onChange={(e) => setLans([mainLan, e.target.value])}
                        >
                          <option value="">无</option>
                          {tracks
                            .filter((t) => t.lan !== mainLan)
                            .map((t) => (
                              <option key={t.lan} value={t.lan}>
                                {trackLabel(t)}
                              </option>
                            ))}
                        </select>
                      </label>
                    </>
                  ) : (
                    <label className="artccpanel-row">
                      <span>字幕</span>
                      <select
                        value={mainLan}
                        onChange={(e) => setLans([e.target.value])}
                      >
                        {tracks.map((t) => (
                          <option key={t.lan} value={t.lan}>
                            {trackLabel(t)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {activeTracks.length > 0 && (
                    <div className="artccpanel-offsets">
                      <p className="artccpanel-offsets-title">
                        时间轴偏移(秒)· 正=字幕延后出现
                      </p>
                      {activeTracks.map((t) => (
                        <div className="artccpanel-offset-row" key={t.lan}>
                          <span className="artccpanel-offset-label">
                            {trackLabel(t)}
                          </span>
                          <button
                            type="button"
                            onClick={() => nudgeCcOffset(t.lan, -500)}
                          >
                            −0.5
                          </button>
                          <button
                            type="button"
                            onClick={() => nudgeCcOffset(t.lan, -100)}
                          >
                            −0.1
                          </button>
                          <CcOffsetInput
                            valueMs={ccOffsets[t.lan] ?? 0}
                            onCommit={(sec) => setCcOffsetAbs(t.lan, sec)}
                          />
                          <button
                            type="button"
                            onClick={() => nudgeCcOffset(t.lan, 100)}
                          >
                            +0.1
                          </button>
                          <button
                            type="button"
                            onClick={() => nudgeCcOffset(t.lan, 500)}
                          >
                            +0.5
                          </button>
                          <button
                            type="button"
                            className="artccpanel-zero"
                            onClick={() => nudgeCcOffset(t.lan, 0)}
                          >
                            归零
                          </button>
                        </div>
                      ))}
                      <p className="artccpanel-hint">
                        只对本视频生效,校准结果会帮到其他学习者
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>,
            ccPanelHost,
          );
        })()}

      {/* 章节面板:点「章」展开,当前章高亮,点击即跳 */}
      {chapterHost &&
        chaptersOpen &&
        chapters.length > 0 &&
        createPortal(
          <div className="artchapter-panel" onClick={(e) => e.stopPropagation()}>
            <header>
              <b>章节</b>
              <button onClick={() => setChaptersOpen(false)} aria-label="关闭">
                <X size={18} strokeWidth={2.6} aria-hidden />
              </button>
            </header>
            <ol>
              {chapters.map((c, i) => {
                const cur = artRef.current?.currentTime ?? 0;
                const next = chapters[i + 1]?.from ?? Number.POSITIVE_INFINITY;
                const active = cur >= c.from && cur < next;
                return (
                  <li key={`${c.from}:${i}`}>
                    <button
                      className={active ? "on" : undefined}
                      onClick={() => {
                        const art = artRef.current;
                        if (art) {
                          art.currentTime = c.from;
                          void art.play();
                        }
                        setChaptersOpen(false);
                      }}
                    >
                      {thumbs[c.from] ? (
                        // 前端抓帧生成的 dataURL,非外链
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          className="artchapter-thumb"
                          src={thumbs[c.from]}
                          alt=""
                        />
                      ) : null}
                      <i>
                        {Math.floor(c.from / 60)}:
                        {String(Math.floor(c.from % 60)).padStart(2, "0")}
                      </i>
                      <span>{c.title}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>,
          chapterHost,
        )}

      {/* 全屏轻量奖励角标(类抖音):右上角滑入,自动消失 */}
      {fxHost &&
        fxItems.length > 0 &&
        createPortal(
          <div className="artfx" aria-live="polite">
            {fxItems.map((item) => (
              <span key={item.id} className={`artfx-chip tone-${item.tone}`}>
                {item.text}
              </span>
            ))}
          </div>,
          fxHost,
        )}

      {/* 时间戳笔记速记层:全屏中也能记,保存后自动收起 */}
      {noteHost &&
        noteOpen &&
        createPortal(
          <div className="artnote-panel" onClick={(e) => e.stopPropagation()}>
            <header>
              <b>
                <NotebookPen size={16} aria-hidden /> 记笔记 ·{" "}
                {Math.floor(noteAt / 60)}:
                {String(noteAt % 60).padStart(2, "0")}
              </b>
              <button
                onClick={() => setNoteOpen(false)}
                aria-label="关闭"
                type="button"
              >
                <X size={18} strokeWidth={2.6} aria-hidden />
              </button>
            </header>
            <MarkdownEditor
              value={noteDraft}
              onChange={setNoteDraft}
              preview={notePreview}
              onTogglePreview={() => setNotePreview((v) => !v)}
              placeholder="支持 Markdown:**重点**、`代码`、- 列表…"
              rows={5}
              autoFocus
            />
            {noteMsg && <p className="artnote-msg">{noteMsg}</p>}
            <footer>
              <button
                type="button"
                className="app-btn-plain"
                onClick={() => setNoteOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="app-btn-primary"
                disabled={noteSaving || !noteDraft.trim()}
                onClick={async () => {
                  setNoteSaving(true);
                  setNoteMsg(null);
                  try {
                    const r = await addVideoNote(
                      courseId,
                      episodeN,
                      noteAt,
                      noteDraft,
                    );
                    if (!r.ok) {
                      setNoteMsg(r.error ?? "没存上,再试一次");
                      return;
                    }
                    setNoteDraft("");
                    setNoteOpen(false);
                    notifyReward("📝 笔记已记下", "review");
                    window.dispatchEvent(
                      new CustomEvent(NOTES_CHANGED_EVENT, {
                        detail: { courseId, episodeN },
                      }),
                    );
                  } finally {
                    setNoteSaving(false);
                  }
                }}
              >
                {noteSaving ? "保存中…" : "保存"}
              </button>
            </footer>
          </div>,
          noteHost,
        )}

      {prefs.cc.on &&
        (() => {
          const shifted = tracks.filter((t) => (ccOffsets[t.lan] ?? 0) !== 0);
          if (shifted.length === 0) return null;
          const text = shifted
            .map((t) => {
              const ms = ccOffsets[t.lan] ?? 0;
              const label = t.lanDoc.split(/[\s·（(]/)[0] || t.lan;
              return `${label} ${ms > 0 ? "+" : ""}${(ms / 1000).toFixed(1)}s`;
            })
            .join(" · ");
          return (
            <p className="biliplayer-hint">
              字幕时间轴偏移:{text}
              (设置菜单「字幕设置」里可调,只对本视频生效,校准结果会帮到其他学习者)
            </p>
          );
        })()}
      {!payload.bound && (
        <p className="biliplayer-hint">
          绑定 bilibili 账号后可解锁高清晰度与 CC 字幕
        </p>
      )}

      <TermUnlockPopup terms={newTerms} onClose={() => setNewTerms([])} />
    </div>
  );
}
