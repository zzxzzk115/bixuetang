// Phaser 游戏入口。只被 GameShell 的 useEffect 动态 import——
// 任何 server 组件 import 这里都会把 phaser 拖进 SSR 包并炸 build（eslint 有规则拦）。
//
// 单 Game 实例常驻，场景 sleep/wake 切换而非销毁重建：WebGL context 重建在低端
// 安卓要几百毫秒且反复重传纹理。只有离开 /play（GameShell 卸载）才 destroy(true)。

import Phaser from "phaser";
import type { GameBootstrap } from "@/lib/game/bootstrap-types";
import { BootScene } from "./scenes/boot";
import { PreloadScene } from "./scenes/preload";
import { MapScene } from "./scenes/map";

export interface GameHandle {
  game: Phaser.Game;
  destroy: () => void;
}

export function createGame(
  host: HTMLElement,
  bootstrap: GameBootstrap,
): GameHandle {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: host,
    backgroundColor: "#0a0d0a",
    render: {
      antialias: false,
      pixelArt: true,
      roundPixels: true,
    },
    // Phaser 4 移除了 config.resolution。画布随容器填满，相机负责整数倍缩放。
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: "100%",
      height: "100%",
    },
    physics: {
      default: "arcade",
      arcade: { debug: false },
    },
    scene: [BootScene, PreloadScene, MapScene],
  });

  // registry 是场景间共享数据的地方；bootstrap 一次性放进去
  game.registry.set("bootstrap", bootstrap);

  return {
    game,
    destroy: () => game.destroy(true),
  };
}
