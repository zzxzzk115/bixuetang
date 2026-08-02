"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Source } from "@/lib/content/schema";
import { embedFor, PLATFORM_LABEL, type EmbedOptions } from "@/lib/embed";
import { SEEK_EVENT, type SeekRequest } from "@/lib/seek";

const NATIVE_KEY = "guild-native-player";

// 原站模式偏好存 localStorage，跨课程记住选择
let prefListeners: (() => void)[] = [];
const prefStore = {
  subscribe(cb: () => void) {
    prefListeners.push(cb);
    return () => {
      prefListeners = prefListeners.filter((l) => l !== cb);
    };
  },
  get: () => localStorage.getItem(NATIVE_KEY) === "1",
  set(v: boolean) {
    localStorage.setItem(NATIVE_KEY, v ? "1" : "0");
    for (const l of prefListeners) l();
  },
};

export function EmbedPlayer({ sources }: { sources: Source[] }) {
  const [active, setActive] = useState(0);
  const [opts, setOpts] = useState<EmbedOptions>({});
  const nativePage = useSyncExternalStore(
    prefStore.subscribe,
    prefStore.get,
    () => false,
  );
  const boxRef = useRef<HTMLDivElement>(null);

  // 分析面板的时间轴跳转：换 src 重载到指定分 P/时间点
  useEffect(() => {
    const onSeek = (e: Event) => {
      const req = (e as CustomEvent<SeekRequest>).detail;
      setOpts({ page: req.page, startSeconds: req.seconds, bvid: req.bvid });
    };
    window.addEventListener(SEEK_EVENT, onSeek);
    return () => window.removeEventListener(SEEK_EVENT, onSeek);
  }, []);

  const source = sources[active];
  const canNative = source.platform === "bilibili";
  const embed = embedFor(source, {
    ...opts,
    nativePage: nativePage && canNative,
  });

  const toggleNative = () => prefStore.set(!nativePage);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        {sources.map((s, i) => (
          <button
            key={i}
            onClick={() => {
              setActive(i);
              setOpts({});
            }}
            className={`rounded-t border border-b-0 px-3 py-1.5 text-sm transition-colors ${
              i === active
                ? "border-edge bg-panel text-gold"
                : "border-transparent bg-transparent text-muted hover:text-foreground"
            }`}
          >
            {PLATFORM_LABEL[s.platform]}
            {s.uploader ? ` · ${s.uploader}` : ""}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pb-1 text-xs">
          {canNative && (
            <button
              onClick={toggleNative}
              title={
                nativePage
                  ? "切回官方嵌入播放器（更轻量）"
                  : "改用 B 站原站页面（弹幕/画质/倍速 UI 完整；注意跨站 iframe 拿不到登录态，清晰度仍是游客上限）"
              }
              className={`rounded border px-2 py-1 transition-colors ${
                nativePage
                  ? "border-gold text-gold"
                  : "border-edge text-muted hover:border-gold hover:text-gold"
              }`}
            >
              {nativePage ? "🌐 原站模式" : "🌐 原站模式"}
            </button>
          )}
          {embed.kind === "iframe" && (
            <button
              onClick={() => void boxRef.current?.requestFullscreen?.()}
              title="全屏"
              className="rounded border border-edge px-2 py-1 text-muted transition-colors hover:border-gold hover:text-gold"
            >
              ⛶ 全屏
            </button>
          )}
        </div>
      </div>
      <div
        ref={boxRef}
        className="overflow-hidden rounded-b rounded-tr border border-edge bg-black"
      >
        {embed.kind === "iframe" ? (
          <iframe
            key={embed.src}
            src={embed.src}
            className="aspect-video w-full"
            allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="no-referrer"
            // 原站页面需要更宽的能力（表单、弹窗、导航），官方 player 收紧
            sandbox={
              nativePage && canNative
                ? "allow-scripts allow-same-origin allow-popups allow-forms allow-presentation allow-popups-to-escape-sandbox"
                : "allow-scripts allow-same-origin allow-popups allow-presentation"
            }
          />
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-panel">
            <p className="text-sm text-muted">该来源不支持内嵌播放</p>
            <a
              href={embed.href}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded border border-gold px-4 py-2 text-sm text-gold hover:bg-gold hover:text-background"
            >
              前往{PLATFORM_LABEL[source.platform]}观看 ↗
            </a>
          </div>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        {source.note && <span>📌 {source.note}</span>}
        {nativePage && canNative && (
          <span className="text-gold">
            原站模式：跨站 iframe 不携带 B 站登录态，清晰度仍受游客限制；
            想要登录态高清请用浏览器插件在原站观看（设置页有说明）
          </span>
        )}
      </div>
    </div>
  );
}
