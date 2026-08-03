import Phaser from "phaser";
import type { GameBootstrap } from "@/lib/game/bootstrap-types";
import {
  HALL_MAP,
  TILE,
  TILE_IDX,
  cellCenter,
  parseHall,
  type Poi,
} from "@/lib/game/hall-map";
import { announceGame } from "@/lib/game/bridge";
import { Player } from "../entities/player";

// 俯视角公会大厅。紧凑单屏——相机适配整间大厅、不跟随，所以一眼看全所有据点，
// 不用走一会儿才发现内容。角色可走动，走近据点浮出「进入」提示（DOM 层画）。

const POI_ACTION: Record<
  Poi["kind"],
  | { mode: "window"; window: "inventory" | "glossary" | "quests" }
  | { mode: "route"; href: (b: GameBootstrap) => string }
> = {
  inventory: { mode: "window", window: "inventory" },
  glossary: { mode: "window", window: "glossary" },
  quests: { mode: "window", window: "quests" },
  tower: { mode: "route", href: (b) => `/paths/${b.paths[0]?.id ?? ""}` },
  trial: { mode: "route", href: () => "/play/trial" },
  lab: { mode: "route", href: () => "/lab" },
};

const POI_SPRITE: Record<Poi["kind"], string> = {
  tower: "column",
  trial: "sword",
  glossary: "chestClosed",
  lab: "torch",
  inventory: "chestOpen",
  quests: "sage",
};

export class HallScene extends Phaser.Scene {
  private player!: Player;
  private pois: Poi[] = [];
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"up" | "down" | "left" | "right" | "enter", Phaser.Input.Keyboard.Key>;
  private activePoi: Poi | null = null;
  private worldW = 0;
  private worldH = 0;

  constructor() {
    super("hall");
  }

  create() {
    const layout = parseHall(HALL_MAP);
    this.worldW = layout.cols * TILE;
    this.worldH = layout.rows * TILE;
    this.pois = layout.pois;

    this.drawRoom(layout.walkable, layout.rows, layout.cols);
    this.drawPois();

    this.player = new Player(this, layout.walkable, layout.spawn);

    // 相机：适配整间大厅、居中、不跟随——大厅小，尽收眼底。
    // 不用 setBounds：内容小于视口时它会把相机 clamp 到左上角、无法居中。
    this.fitCamera();
    this.scale.on("resize", this.fitCamera, this);

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

    const onDomEnter = () => this.enterActivePoi();
    window.addEventListener("guild:poi-enter", onDomEnter);

    // 点击/触摸寻路
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      const world = this.cameras.main.getWorldPoint(p.x, p.y);
      this.player.walkTo(world.x, world.y);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("guild:poi-enter", onDomEnter);
      window.dispatchEvent(new CustomEvent("guild:poi", { detail: null }));
      this.scale.off("resize", this.fitCamera, this);
    });
  }

  /** 相机缩放到整间大厅刚好塞进视口（留一点边距），并居中 */
  private fitCamera = () => {
    const w = typeof window !== "undefined" ? window.innerWidth : 800;
    const h = typeof window !== "undefined" ? window.innerHeight : 600;
    // 留 8% 边距，避免大厅顶到屏幕边缘
    const zoom = Math.min(w / this.worldW, h / this.worldH) * 0.92;
    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(this.worldW / 2, this.worldH / 2);
  };

  private drawRoom(walkable: boolean[][], rows: number, cols: number) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const c = cellCenter(col, row);
        if (walkable[row][col]) {
          this.add.image(c.x, c.y, "tiles", TILE_IDX.floor).setDepth(0);
        } else {
          // 顶行用墙顶面，其余用墙身，做出一点立体感
          const idx = row === 0 ? TILE_IDX.wallTop : TILE_IDX.wall;
          this.add.image(c.x, c.y, "tiles", idx).setDepth(1);
        }
      }
    }
  }

  private drawPois() {
    for (const poi of this.pois) {
      const c = cellCenter(poi.col, poi.row);
      this.add.image(c.x, c.y, POI_SPRITE[poi.kind]).setDepth(2);
      this.add
        .text(c.x, c.y - TILE * 0.85, poi.label, {
          fontFamily: '"ArkPixel", monospace',
          fontSize: "12px",
          color: "#f0e4c4",
        })
        .setOrigin(0.5)
        .setDepth(6)
        .setResolution(3);
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
