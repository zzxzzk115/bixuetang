"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GameBootstrap } from "@/lib/game/bootstrap-types";
import { GAME_EVENT, type GameToReact } from "@/lib/game/bridge";
import { RouteSheet } from "./route-sheet";

// 全屏游戏的 React 外壳。职责：
//   1. 字体先行 + 动态 import phaser + 建 Game（沿用 phaser-dungeon.tsx 验证过的模式）
//   2. DOM 顶栏：当前路线名 + 切换路线（多邻国式选线面板）+ 快捷入口
//   3. 监听游戏 → React 事件（跳转/开窗口），卸载时 destroy(true)

const ROUTE_KEY = "guild-route";

export function GameShell({ bootstrap }: { bootstrap: GameBootstrap }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<{
    game: { registry: { set(k: string, v: unknown): void }; scene: { getScene(k: string): { scene: { restart(d?: object): void } } | null } };
    destroy: () => void;
  } | null>(null);
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [routeId, setRouteId] = useState<string>(bootstrap.paths[0]?.id ?? "");

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

      // 上次选的路线（本地记忆），没有就用第一条
      const saved =
        typeof localStorage !== "undefined"
          ? localStorage.getItem(ROUTE_KEY)
          : null;
      const initial =
        (saved && bootstrap.paths.some((p) => p.id === saved) && saved) ||
        bootstrap.paths[0]?.id ||
        "";
      setRouteId(initial);

      const handle = createGame(hostRef.current, bootstrap);
      handle.game.registry.set("route", initial);
      gameRef.current = handle as unknown as typeof gameRef.current;
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
      if (ev.type === "leave-game" && ev.href) router.push(ev.href);
      // open-window 在 G2+ 接窗口层
    };
    window.addEventListener(GAME_EVENT, onGame);
    return () => window.removeEventListener(GAME_EVENT, onGame);
  }, [router]);

  const selectRoute = useCallback((pathId: string) => {
    setRouteId(pathId);
    setSheetOpen(false);
    try {
      localStorage.setItem(ROUTE_KEY, pathId);
    } catch {
      // 隐私模式存不了就算了，只影响下次默认选中
    }
    const g = gameRef.current?.game;
    g?.registry.set("route", pathId);
    g?.scene.getScene("map")?.scene.restart({ pathId });
  }, []);

  const routeTitle =
    bootstrap.paths.find((p) => p.id === routeId)?.title ?? "选择路线";

  return (
    <div className="game-root">
      <div ref={hostRef} className="game-canvas" />
      {!ready && <div className="game-loading">进入公会……</div>}

      {/* 顶栏：路线切换 + 快捷入口（DOM，像素风） */}
      {ready && (
        <div className="game-topbar">
          <button className="game-topbar-route" onClick={() => setSheetOpen(true)}>
            ≡ {routeTitle}
          </button>
          <div className="game-topbar-links">
            <button onClick={() => router.push("/play/trial")}>试炼</button>
            <button onClick={() => router.push("/lab")}>工坊</button>
            <button onClick={() => router.push("/glossary")}>卷宗</button>
          </div>
        </div>
      )}

      {sheetOpen && (
        <RouteSheet
          bootstrap={bootstrap}
          currentId={routeId}
          onSelect={selectRoute}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}
