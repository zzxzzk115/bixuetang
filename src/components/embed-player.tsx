"use client";

import { useEffect, useState } from "react";
import type { Source } from "@/lib/content/schema";
import { embedFor, PLATFORM_LABEL, type EmbedOptions } from "@/lib/embed";
import { SEEK_EVENT, type SeekRequest } from "@/lib/seek";

export function EmbedPlayer({ sources }: { sources: Source[] }) {
  const [active, setActive] = useState(0);
  const [opts, setOpts] = useState<EmbedOptions>({});

  // 分析面板的时间轴跳转：换 src 重载到指定分 P/时间点
  useEffect(() => {
    const onSeek = (e: Event) => {
      const req = (e as CustomEvent<SeekRequest>).detail;
      setOpts({ page: req.page, startSeconds: req.seconds });
    };
    window.addEventListener(SEEK_EVENT, onSeek);
    return () => window.removeEventListener(SEEK_EVENT, onSeek);
  }, []);

  const source = sources[active];
  const embed = embedFor(source, opts);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
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
      </div>
      <div className="overflow-hidden rounded-b rounded-tr border border-edge bg-black">
        {embed.kind === "iframe" ? (
          <iframe
            key={embed.src}
            src={embed.src}
            className="aspect-video w-full"
            allowFullScreen
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
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
      {source.note && (
        <p className="mt-1.5 text-xs text-muted">📌 {source.note}</p>
      )}
    </div>
  );
}
