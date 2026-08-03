"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Source } from "@/lib/content/schema";
import { embedFor, PLATFORM_LABEL, type EmbedOptions } from "@/lib/embed";
import { SEEK_EVENT, type SeekRequest } from "@/lib/seek";

const NATIVE_KEY = "guild-native-player";

let prefListeners: (() => void)[] = [];
const prefStore = {
  subscribe(callback: () => void) {
    prefListeners.push(callback);
    return () => {
      prefListeners = prefListeners.filter((listener) => listener !== callback);
    };
  },
  get: () => localStorage.getItem(NATIVE_KEY) === "1",
  set(value: boolean) {
    localStorage.setItem(NATIVE_KEY, value ? "1" : "0");
    for (const listener of prefListeners) listener();
  },
};

export function EmbedPlayer({ sources }: { sources: Source[] }) {
  const [active, setActive] = useState(0);
  const [options, setOptions] = useState<EmbedOptions>({});
  const nativePage = useSyncExternalStore(prefStore.subscribe, prefStore.get, () => false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onSeek = (event: Event) => {
      const request = (event as CustomEvent<SeekRequest>).detail;
      setOptions({ page: request.page, startSeconds: request.seconds, bvid: request.bvid });
    };
    window.addEventListener(SEEK_EVENT, onSeek);
    return () => window.removeEventListener(SEEK_EVENT, onSeek);
  }, []);

  const source = sources[active];
  const canNative = source.platform === "bilibili";
  const embed = embedFor(source, { ...options, nativePage: nativePage && canNative });

  return (
    <div>
      <div className="player-toolbar">
        <div className="flex min-w-0 flex-wrap">
          {sources.map((item, index) => (
            <button
              key={index}
              onClick={() => {
                setActive(index);
                setOptions({});
              }}
              className={`player-source ${index === active ? "active" : ""}`}
            >
              {PLATFORM_LABEL[item.platform]}
              {item.uploader ? ` · ${item.uploader}` : ""}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {canNative && (
            <button
              onClick={() => prefStore.set(!nativePage)}
              title="切换 B 站原站页面"
              className={`player-tool ${nativePage ? "active" : ""}`}
            >
              原站
            </button>
          )}
          {embed.kind === "iframe" && (
            <button
              onClick={() => void boxRef.current?.requestFullscreen?.()}
              title="全屏播放"
              className="player-tool"
            >
              全屏
            </button>
          )}
        </div>
      </div>

      <div ref={boxRef} className="overflow-hidden border border-edge bg-black">
        {embed.kind === "iframe" ? (
          <iframe
            key={embed.src}
            src={embed.src}
            className="aspect-video w-full"
            allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="no-referrer"
            sandbox={
              nativePage && canNative
                ? "allow-scripts allow-same-origin allow-popups allow-forms allow-presentation allow-popups-to-escape-sandbox"
                : "allow-scripts allow-same-origin allow-popups allow-presentation"
            }
          />
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-panel">
            <p className="text-sm text-muted">该来源不支持内嵌播放</p>
            <a href={embed.href} target="_blank" rel="noreferrer noopener" className="command-button">
              前往 {PLATFORM_LABEL[source.platform]}
            </a>
          </div>
        )}
      </div>

      {source.note && (
        <div className="mt-1.5 border-l-2 border-hp pl-2 font-mono text-[10px] text-muted">
          SOURCE NOTE // {source.note}
        </div>
      )}
    </div>
  );
}
