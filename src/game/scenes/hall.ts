import Phaser from "phaser";
import type { GameBootstrap } from "@/lib/game/bootstrap-types";
import {
  HALL_MAP,
  TILE,
  cellCenter,
  parseHall,
  type Poi,
} from "@/lib/game/hall-map";
import { announceGame } from "@/lib/game/bridge";
import { Player } from "../entities/player";

// 俯视角公会大厅。角色可走动，走近据点浮出「进入」提示（DOM 层画）。
// 相机跟随角色 + 整数倍缩放，竖屏横屏都无黑边。

/** 据点走进去要做什么。窗口类走 DOM 弹窗，其余整页跳转（旧页面，G5 再窗口化） */
const POI_ACTION: Record<
  Poi["kind"],
  | { mode: "window"; window: "inventory" | "glossary" | "quests" }
  | { mode: "route"; href: (b: GameBootstrap) => string }
> = {
  inventory: { mode: "window", window: "inventory" },
  glossary: { mode: "window", window: "glossary" },
  quests: { mode: "window", window: "quests" },
  // G1：塔门先跳第一条路径的塔页，G4 换成 Phaser 塔场景
  tower: { mode: "route", href: (b) => `/paths/${b.paths[0]?.id ?? ""}` },
  trial: { mode: "route", href: () => "/play/trial" }, // G3 占位
  lab: { mode: "route", href: () => "/lab" },
};

const POI_SPRITE: Record<Poi["kind"], string> = {
  tower: "column",
  trial: "sword",
  glossary: "chestClosed",
  lab: "torch1",
  inventory: "chestOpen",
  quests: "sage",
};

export class HallScene extends Phaser.Scene {
  private player!: Player;
  private pois: Poi[] = [];
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"up" | "down" | "left" | "right" | "enter", Phaser.Input.Keyboard.Key>;
  private activePoi: Poi | null = null;

  constructor() {
    super("hall");
  }

  create() {
    const layout = parseHall(HALL_MAP);
    const worldW = layout.cols * TILE;
    const worldH = layout.rows * TILE;
    this.pois = layout.pois;

    this.drawFloor(layout.rows, layout.cols);
    this.drawWalls();
    this.drawPois();

    const bootstrap = this.registry.get("bootstrap") as GameBootstrap;
    this.player = new Player(this, layout.walkable, layout.spawn, "sage");
    void bootstrap;

    // 相机：整数倍缩放，跟随角色
    const cam = this.cameras.main;
    cam.setBounds(0, 0, worldW, worldH);
    cam.startFollow(this.player.sprite, true, 0.12, 0.12);
    this.applyZoom();
    this.scale.on("resize", this.applyZoom, this);

    // 键盘（桌面）
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = {
      up: kb.addKey("W"),
      down: kb.addKey("S"),
      left: kb.addKey("A"),
      right: kb.addKey("D"),
      enter: kb.addKey("E"),
    };
    this.wasd.enter.on("down", () => this.enterActivePoi());

    // DOM「进入」大按钮（移动端主通道）
    const onDomEnter = () => this.enterActivePoi();
    window.addEventListener("guild:poi-enter", onDomEnter);

    // 点击/触摸寻路
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      const world = cam.getWorldPoint(p.x, p.y);
      this.player.walkTo(world.x, world.y);
    });

    // 离开场景时收掉 DOM 提示与监听，别残留
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("guild:poi-enter", onDomEnter);
      window.dispatchEvent(new CustomEvent("guild:poi", { detail: null }));
      this.scale.off("resize", this.applyZoom, this);
    });
  }

  private applyZoom = () => {
    // 用 CSS 视口（DPR 无关）算，别用 scale.gameSize——它在 RESIZE 模式下含 DPR，
    // 会让高分屏 zoom 偏大、只看到几格。目标：短边显示约 14 格。
    const w = typeof window !== "undefined" ? window.innerWidth : 800;
    const h = typeof window !== "undefined" ? window.innerHeight : 600;
    const zoom = Math.max(2, Math.min(4, Math.floor(Math.min(w, h) / (14 * TILE))));
    this.cameras.main.setZoom(zoom);
  };

  private drawFloor(rows: number, cols: number) {
    const floor = this.add
      .tileSprite(0, 0, cols * TILE, rows * TILE, "floor")
      .setOrigin(0)
      .setDepth(0);
    void floor;
  }

  private drawWalls() {
    const layout = parseHall(HALL_MAP);
    for (let row = 0; row < layout.rows; row++) {
      for (let col = 0; col < layout.cols; col++) {
        if (!layout.walkable[row][col]) {
          const ch = HALL_MAP[row]?.[col] ?? " ";
          if (ch === "#") {
            const c = cellCenter(col, row);
            this.add.image(c.x, c.y, "wall").setDepth(1);
          }
        }
      }
    }
  }

  private drawPois() {
    for (const poi of this.pois) {
      const c = cellCenter(poi.col, poi.row);
      this.add.image(c.x, c.y, POI_SPRITE[poi.kind]).setDepth(2);
      // 据点名（像素字，12px）
      this.add
        .text(c.x, c.y - TILE * 0.9, poi.label, {
          fontFamily: '"ArkPixel", monospace',
          fontSize: "12px",
          color: "#e6dcc0",
        })
        .setOrigin(0.5)
        .setDepth(3)
        .setResolution(2);
    }
  }

  private keyVec() {
    const left = this.cursors.left.isDown || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;
    const up = this.cursors.up.isDown || this.wasd.up.isDown;
    const down = this.cursors.down.isDown || this.wasd.down.isDown;
    return {
      col: (right ? 1 : 0) - (left ? 1 : 0),
      row: (down ? 1 : 0) - (up ? 1 : 0),
    };
  }

  private enterActivePoi() {
    if (!this.activePoi) return;
    const action = POI_ACTION[this.activePoi.kind];
    if (action.mode === "window") {
      announceGame({ type: "open-window", window: action.window });
    } else {
      const bootstrap = this.registry.get("bootstrap") as GameBootstrap;
      announceGame({ type: "leave-game", href: action.href(bootstrap) });
    }
  }

  update(_time: number, delta: number) {
    this.player.update(delta, this.keyVec());

    // 找最近的、在触发半径内的 POI
    let nearest: Poi | null = null;
    let nearestDist = Infinity;
    for (const poi of this.pois) {
      const c = cellCenter(poi.col, poi.row);
      const d = this.player.distanceTo(c.x, c.y);
      if (d <= poi.radius && d < nearestDist) {
        nearest = poi;
        nearestDist = d;
      }
    }
    if (nearest !== this.activePoi) {
      this.activePoi = nearest;
      // 通知 DOM 层显示/隐藏「进入」大按钮
      window.dispatchEvent(
        new CustomEvent("guild:poi", {
          detail: nearest
            ? { kind: nearest.kind, label: nearest.label }
            : null,
        }),
      );
    }
  }
}
