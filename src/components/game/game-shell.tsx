"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GameBootstrap } from "@/lib/game/bootstrap-types";
import { GAME_EVENT, type GameToReact } from "@/lib/game/bridge";

// 全屏游戏的 React 外壳。职责：
//   1. 字体先行 + 动态 import phaser + 建 Game（沿用 phaser-dungeon.tsx 验证过的模式）
//   2. 监听游戏 → React 事件（开窗口 / 离开游戏），转成路由跳转或 DOM 窗口
//   3. 卸载时 destroy(true)——离开 /play 才销毁，避免 WebGL context 泄漏

export function GameShell({ bootstrap }: { bootstrap: GameBootstrap }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<{ destroy: () => void } | null>(null);
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function mount() {
      // Phaser 建 Text 时立刻量字烘贴图，字体没就位会永久错版
      try {
        await document.fonts.load('12px "ArkPixel"');
        await document.fonts.ready;
      } catch {
        // 字体挂了也别把整个游戏拦下，退回等宽字体
      }
      const { createGame } = await import("@/game");
      if (cancelled || !hostRef.current) return;
      const handle = createGame(hostRef.current, bootstrap);
      gameRef.current = handle;
      // 无头验证用的调试句柄；生产无害（只是个引用）
      (window as unknown as { __guildGame?: unknown }).__guildGame = handle.game;
      setReady(true);
    }

    void mount();
    return () => {
      cancelled = true;
      gameRef.current?.destroy();
      gameRef.current = null;
    };
  }, [bootstrap]);

  // 游戏 → React
  useEffect(() => {
    const onGame = (e: Event) => {
      const ev = (e as CustomEvent<GameToReact>).detail;
      if (ev.type === "leave-game") {
        if (ev.href) router.push(ev.href);
      }
      // open-window / hud 在后续里程碑接窗口层，这里先只处理跳转
    };
    window.addEventListener(GAME_EVENT, onGame);
    return () => window.removeEventListener(GAME_EVENT, onGame);
  }, [router]);

  return (
    <div className="game-root">
      <div ref={hostRef} className="game-canvas" />
      {!ready && <div className="game-loading">进入公会……</div>}
    </div>
  );
}
