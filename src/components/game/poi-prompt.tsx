"use client";

import { useEffect, useState } from "react";

// 走近据点时浮在屏幕底部的「进入」大按钮。
// 移动端没有键盘，这个 DOM 按钮是进入据点的主通道（桌面另可按 E）；
// 高度 ≥52px、宽度撑满拇指区，放在 safe-area 之上。

interface PoiState {
  kind: string;
  label: string;
}

export function PoiPrompt() {
  const [poi, setPoi] = useState<PoiState | null>(null);

  useEffect(() => {
    const onPoi = (e: Event) => {
      setPoi((e as CustomEvent<PoiState | null>).detail);
    };
    window.addEventListener("guild:poi", onPoi);
    return () => window.removeEventListener("guild:poi", onPoi);
  }, []);

  if (!poi) return null;

  return (
    <button
      className="poi-prompt"
      onClick={() => window.dispatchEvent(new CustomEvent("guild:poi-enter"))}
    >
      <span className="poi-prompt-key">E</span>
      进入 · {poi.label}
    </button>
  );
}
