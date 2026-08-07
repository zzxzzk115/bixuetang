"use client";

import { useEffect, useRef, useState } from "react";
import {
  lottieCandidates,
  type LottieMomentName,
} from "@/lib/lottie-manifest";

// Lottie 播放层:按「时刻名」找 public/lottie/ 下的素材播一次。
// 素材缺失时返回 null,调用方自然落回 CSS 动效——加素材零改码。

/** 探测结果缓存:整个会话内每个文件只 HEAD 一次 */
const probeCache = new Map<string, Promise<string | null>>();

function probe(moment: LottieMomentName): Promise<string | null> {
  const key = moment;
  const cached = probeCache.get(key);
  if (cached) return cached;
  const p = (async () => {
    for (const url of lottieCandidates(moment)) {
      try {
        const res = await fetch(url, { method: "HEAD" });
        if (res.ok) return url;
      } catch {
        // 网络错误当缺失
      }
    }
    return null;
  })();
  probeCache.set(key, p);
  return p;
}

/** 该时刻是否有 Lottie 素材(undefined=探测中) */
export function useLottieAvailable(
  moment: LottieMomentName | null,
): boolean | undefined {
  const [available, setAvailable] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    if (!moment) return;
    let cancelled = false;
    void probe(moment).then((url) => {
      if (!cancelled) setAvailable(url !== null);
    });
    return () => {
      cancelled = true;
    };
  }, [moment]);
  return moment ? available : false;
}

export function LottieMoment({
  moment,
  className,
  loop = false,
}: {
  moment: LottieMomentName;
  className?: string;
  loop?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let player: { destroy: () => void } | null = null;
    void (async () => {
      const url = await probe(moment);
      if (cancelled || !url || !canvasRef.current) return;
      const { DotLottie } = await import("@lottiefiles/dotlottie-web");
      if (cancelled) return;
      player = new DotLottie({
        canvas: canvasRef.current,
        src: url,
        autoplay: true,
        loop,
      });
    })();
    return () => {
      cancelled = true;
      try {
        player?.destroy();
      } catch {
        // 已销毁
      }
    };
  }, [moment, loop]);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}
