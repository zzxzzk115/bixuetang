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
import { Loader2, X } from "lucide-react";
import type Artplayer from "artplayer";
import type { Setting as ArtSetting } from "artplayer";
import type { MediaPlayerClass } from "dashjs";
import { reportWatchProgress } from "@/lib/game/watch-actions";
import { saveCcOffset, savePlayerPrefs } from "@/lib/game/user-state-actions";
import { announceSettle } from "@/lib/reward-feedback";
import { buildSegments, segmentCoverage } from "@/lib/segments";
import { TermUnlockPopup, type UnlockedTerm } from "./term-unlock-popup";
import { detectPlayMode } from "./player-capability";
import { prefsStore } from "./player-settings";

// bilibili 播放器,ArtPlayer(MIT)+ dash.js 组合:
//   · DASH 分片流交给 dash.js 走 MSE / ManagedMediaSource(iOS 17.1+),
//     1080P+、自适应码率、换清晰度不丢进度;老设备回退渐进 MP4
//   · 手势/全屏/横屏/锁屏/进度条/加载态全部用 ArtPlayer 的成熟实现
//   · 弹幕用官方 artplayer-plugin-danmuku(防重叠,设置面板自带)
//   · CC 字幕仍是自研 DOM 层:双语双行、per-user 时间轴偏移、
//     AI/可疑轨标记,这些 ArtPlayer 的单轨 VTT 引擎做不了
//   · 业务钩子不变:逐秒记录看过的秒,覆盖率 ≥90% 自动打卡

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
  initialRatioPct = 0,
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
  /** 库里已累计的观看覆盖率,显示时不能被本次会话打回 0 */
  initialRatioPct?: number;
  /** 服务端存的播放偏好 JSON(权威值,跨设备一致) */
  serverPrefs?: string | null;
  /** 本集 AI 分析里带时间戳的关键点(进度条刻度 + 分段边界) */
  keyPointMarks?: { t: number; title: string }[];
  onCompleted?: () => void;
  onLoaded?: (info: { aid: number; cid: number }) => void;
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
  const [ccOffset, setCcOffset] = useState(0);
  /** ArtPlayer 建好后暴露的层挂载点,React 往里 portal */
  const [ccHost, setCcHost] = useState<HTMLElement | null>(null);
  /** 章节面板(viewPoints 或分段) */
  const [chapterHost, setChapterHost] = useState<HTMLElement | null>(null);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [chapters, setChapters] = useState<{ title: string; from: number }[]>(
    [],
  );

  const prefs = useSyncExternalStore(
    prefsStore.subscribe,
    prefsStore.get,
    prefsStore.getServerSnapshot,
  );

  const seenRef = useRef<Set<number>>(new Set());
  const completedRef = useRef(false);
  const ccOffsetRef = useRef(0);
  const lastCuesRef = useRef("");
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
        onLoaded?.({ aid: data.aid, cid: data.cid });
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
  }, [payload?.cid, payload?.durationSec, bvid, courseId, episodeN]);

  // 启用的字幕轨:用户选过就用选的;没选过自动挑人工轨(中文优先,
  // 中英都有就叠加双语)。只有 AI/可疑轨时不自动开——bilibili 的 AI
  // 字幕经常是别的视频的内容,自动挂上去只会误导人。
  const activeTracks = useMemo(() => {
    const pickList = (() => {
      if (tracks.length === 0) return [] as SubtitleTrack[];
      const picked = tracks.filter((t) => prefs.cc.lans.includes(t.lan));
      if (picked.length > 0) return picked;
      const human = tracks.filter((t) => !t.ai && !t.suspect);
      const zh = human.find((t) => t.lan.toLowerCase().startsWith("zh"));
      const en = human.find((t) => t.lan.toLowerCase().startsWith("en"));
      if (zh && en) return [zh, en];
      if (zh) return [zh];
      if (en) return [en];
      if (human.length > 0) return [human[0]];
      return [] as SubtitleTrack[];
    })();
    // 主语言排最前(渲染在最上、字号最大)。默认中文在上;
    // 英语为主的学习者可在设置里换成英文在上。
    const primaryFirst = (t: SubtitleTrack) =>
      t.lan.toLowerCase().startsWith(prefs.cc.primary) ? 0 : 1;
    return [...pickList].sort((a, b) => primaryFirst(a) - primaryFirst(b));
  }, [tracks, prefs.cc.lans, prefs.cc.primary]);
  const activeTracksRef = useRef(activeTracks);
  useEffect(() => {
    activeTracksRef.current = activeTracks;
    lastCuesRef.current = "";
  }, [activeTracks]);

  /**
   * 调字幕时间轴。立刻生效,落库防抖 600ms——按住 -0.5 连点时
   * 不该每下都写一次数据库。
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

  const nudgeCcOffset = useCallback((deltaMs: number) => {
    setCcOffset((prev) => {
      const next =
        deltaMs === 0
          ? 0
          : Math.max(-30_000, Math.min(30_000, prev + deltaMs));
      ccOffsetRef.current = next;
      const cid = cidRef.current;
      if (cid) {
        if (offsetSaveRef.current) clearTimeout(offsetSaveRef.current);
        offsetSaveRef.current = setTimeout(() => {
          void saveCcOffset(cid, next);
        }, 600);
      }
      return next;
    });
  }, []);

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
      const chapterEl = document.createElement("div");
      chapterEl.className = "artchapter-host";

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
        pip: true,
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
          { name: "chapters", html: chapterEl },
        ],
        controls: [
          ...(marks.length > 0
            ? [
                {
                  // 下一知识点:长视频里「跳去下一个讲点」比盲目快进有用得多
                  name: "nextMark",
                  position: "right" as const,
                  index: 3,
                  tooltip: "下一知识点(n)",
                  html: `<span class="artp-next">⏭</span>`,
                  click: () => {
                    jumpNextMark();
                  },
                },
              ]
            : []),
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
            name: "watch",
            position: "right",
            index: 5,
            html: `<span class="artp-watch" title="本集观看覆盖率,≥90% 自动打卡">${initialRatioPct}%</span>`,
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
      setChapterHost(chapterEl);

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

      // 覆盖率追踪 + CC 字幕行,都挂在 timeupdate 上
      const watchEl = () => {
        const el = art?.controls?.watch as HTMLElement | undefined;
        return el?.querySelector<HTMLElement>(".artp-watch") ?? el ?? null;
      };
      art.on("video:timeupdate", () => {
        if (!art) return;
        const t = art.currentTime;
        seenRef.current.add(Math.floor(t));
        const total = art.duration || payload.durationSec || 0;
        if (total > 0) {
          const pct = Math.max(
            initialRatioPct,
            Math.min(100, Math.round((seenRef.current.size / total) * 100)),
          );
          const el = watchEl();
          if (el) el.textContent = `${pct}%`;
        }
        // 正偏移 = 字幕延后出现,查表时把时间轴往回拨
        if (prefsStore.get().cc.on && activeTracksRef.current.length > 0) {
          const at = t - ccOffsetRef.current / 1000;
          const next = activeTracksRef.current.map(
            (track) =>
              track.cues.find((c) => at >= c.from && at <= c.to)?.text ?? "",
          );
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
      setChapterHost(null);
      setChaptersOpen(false);
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

  // 字幕轨到手后把 CC 设置塞进设置菜单(轨道列表取决于异步结果,
  // 建播放器时还没有,只能后补)
  useEffect(() => {
    const art = artRef.current;
    if (!art || tracks.length === 0) return;
    const name = "cc-setting";
    const ccSetting: ArtSetting = {
      name,
      html: "CC 字幕",
      width: 240,
      tooltip: prefsStore.get().cc.on ? "开" : "关",
      selector: [
        {
          html: "显示字幕",
          switch: prefsStore.get().cc.on,
          onSwitch: (item) => {
            const next = !item.switch;
            prefsStore.set({ cc: { ...prefsStore.get().cc, on: next } });
            return next;
          },
        },
        ...tracks.map((t): ArtSetting => ({
          html:
            t.lanDoc + (t.ai ? " · AI" : "") + (t.suspect ? " ⚠" : ""),
          tooltip: t.suspect
            ? "时间轴对不上,多半挂错了"
            : t.ai
              ? "AI 生成,可能不准"
              : undefined,
          switch: activeTracks.some((a) => a.lan === t.lan),
          onSwitch: (item) => {
            const cur = prefsStore.get().cc;
            const has = cur.lans.includes(t.lan);
            const lans = has
              ? cur.lans.filter((l) => l !== t.lan)
              : [...cur.lans, t.lan];
            prefsStore.set({ cc: { ...cur, lans, on: true } });
            return !item.switch;
          },
        })),
        {
          html: "中文在上(主)",
          switch: prefsStore.get().cc.primary === "zh",
          onSwitch: (item) => {
            const next = !item.switch;
            prefsStore.set({
              cc: { ...prefsStore.get().cc, primary: next ? "zh" : "en" },
            });
            return next;
          },
        },
        {
          html: "字幕慢 0.5s",
          onSelect: () => {
            nudgeCcOffset(500);
            return "已调整";
          },
        },
        {
          html: "字幕快 0.5s",
          onSelect: () => {
            nudgeCcOffset(-500);
            return "已调整";
          },
        },
        {
          html: "时间轴归零",
          onSelect: () => {
            nudgeCcOffset(0);
            return "已归零";
          },
        },
      ],
    };
    art.setting.add(ccSetting);
    return () => {
      try {
        art.setting.remove(name);
      } catch {
        // 播放器已销毁
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeTracks 只影响初始勾选态,菜单不必随它重建
  }, [tracks, nudgeCcOffset, ccHost]);

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
      const r = await reportWatchProgress(
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
      if (r.completed && !completedRef.current) {
        completedRef.current = true;
        // 自动打卡的主路径也要有完整反馈:XP/金币/彩蛋/连胜/升级庆祝——
        // 之前这里只弹词条弹窗,最常见的学习行为反而最没回报感
        if (r.settle) announceSettle(r.settle);
        const terms = r.settle?.unlockedTerms ?? [];
        if (terms.length > 0) setNewTerms(terms);
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
  }, [payload, courseId, episodeN, onCompleted]);

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
  }, [payload, jumpNextMark]);

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

      {ccOffset !== 0 && prefs.cc.on && (
        <p className="biliplayer-hint">
          字幕时间轴偏移 {ccOffset > 0 ? "+" : ""}
          {(ccOffset / 1000).toFixed(1)}s(设置菜单里可调,只对本视频生效)
        </p>
      )}
      {!payload.bound && (
        <p className="biliplayer-hint">
          绑定 bilibili 账号后可解锁高清晰度与 CC 字幕
        </p>
      )}

      <TermUnlockPopup terms={newTerms} onClose={() => setNewTerms([])} />
    </div>
  );
}
