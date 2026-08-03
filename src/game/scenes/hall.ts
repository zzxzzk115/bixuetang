import Phaser from "phaser";
import type { GameBootstrap } from "@/lib/game/bootstrap-types";
import { HALL_MAP, type Poi } from "@/lib/game/hall-map";
import { announceGame } from "@/lib/game/bridge";

// 公会大厅：贪婪洞窟一代主城式「小星球」。
//
// 一颗大圆星球，圆心在屏幕下方之外，只露出顶部一段弧面（部分半球视野）。
// 6 个据点（洞口/NPC）钉在球面不同角度上，随星球一起转；拖拽（鼠标/触屏）
// 旋转星球把远处的据点转到面前。角色固定站在球顶，按旋转角速度播
// idle / walk / run 动画（世界在脚下转 = 人在走），行走时相机有轻微上下颠簸。
// 点按（位移 < 阈值）命中据点即进入。全部按屏幕比例布局，横竖屏自适应。

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
  lab: "torch",
  quests: "sage",
  inventory: "chestOpen",
  glossary: "chestClosed",
};

/** 角速度阈值（弧度/秒）：idle ↔ walk ↔ run */
const WALK_W = 0.045;
const RUN_W = 0.5;
/** 惯性衰减时间常数（毫秒） */
const INERTIA_TAU = 650;
/** 点按判定：总位移小于该像素数视为 tap */
const TAP_SLOP = 10;

interface PoiNode {
  poi: Poi;
  /** 球面角（0 = 球顶，顺时针为正） */
  theta: number;
  node: Phaser.GameObjects.Container;
  halo: Phaser.GameObjects.Arc;
}

export class HallScene extends Phaser.Scene {
  private planet!: Phaser.GameObjects.Container;
  private hero!: Phaser.GameObjects.Sprite;
  private poiNodes: PoiNode[] = [];

  private planetR = 0;
  private center = { x: 0, y: 0 };
  private minDim = 0;

  /** 星球当前转角与角速度 */
  private rot = 0;
  private omega = 0;
  private dragging = false;
  private dragLastX = 0;
  private dragLastT = 0;
  private dragMoved = 0;
  private bobPhase = 0;

  constructor() {
    super("hall");
  }

  create() {
    this.build();
    this.scale.on("resize", this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.onResize, this);
    });
  }

  private onResize = () => {
    this.scene.restart();
  };

  private build() {
    // restart 复用同一 Scene 实例，实例字段不会自动归零——
    // 不清空的话 poiNodes 会越积越多（旧显示对象已销毁但引用还在）
    this.poiNodes = [];
    this.rot = 0;
    this.omega = 0;
    this.dragging = false;
    this.bobPhase = 0;

    const { width: W, height: H } = this.scale.gameSize;
    this.minDim = Math.min(W, H);

    // 球顶（角色脚底）位置与半径：半径按短边取，竖屏露出近半球、横屏露出顶弧
    const topY = H * 0.74;
    this.planetR = this.minDim * 0.62;
    this.center = { x: W / 2, y: topY + this.planetR };

    this.drawSky(W, H);
    this.drawStars(W, H * 0.6);
    this.drawMountains(W, topY);

    this.planet = this.add.container(this.center.x, this.center.y).setDepth(10);
    this.drawPlanetSurface();
    this.buildPois();

    // 角色固定站在球顶偏左，面朝洞口——转到面前的据点在他身旁，不被挡住
    this.hero = this.add
      .sprite(
        this.center.x - this.minDim * 0.11,
        topY + this.minDim * 0.012,
        "hero",
        "walk-down-3.png",
      )
      .setOrigin(0.5, 1)
      .setScale(this.minDim * 0.008)
      .setDepth(30);
    this.hero.play("hero-idle-down");

    // 首次进入的拖拽提示，动过一次就淡出
    const hint = this.add
      .text(this.center.x, topY + this.minDim * 0.1, "⟨ 拖动旋转世界 ⟩", {
        fontFamily: '"ArkPixel", monospace',
        fontSize: this.minDim < 620 ? "12px" : "24px",
        color: "#c9b878",
      })
      .setOrigin(0.5)
      .setDepth(40)
      .setAlpha(0.85)
      .setResolution(3);
    this.tweens.add({
      targets: hint,
      alpha: 0.35,
      duration: 1000,
      yoyo: true,
      repeat: -1,
    });
    const dismissHint = () => {
      if (Math.abs(this.omega) > 0.02 || this.dragMoved > TAP_SLOP) {
        this.tweens.killTweensOf(hint);
        this.tweens.add({ targets: hint, alpha: 0, duration: 400 });
        this.input.off("pointermove", dismissHint);
      }
    };
    this.input.on("pointermove", dismissHint);

    this.setupDrag();
    this.rot = 0;
    this.omega = 0;
    this.applyRotation();
  }

  // ---------- 背景 ----------

  private drawSky(W: number, H: number) {
    const g = this.add.graphics().setDepth(0);
    g.fillGradientStyle(0x14264a, 0x14264a, 0x2c2140, 0x2c2140, 1);
    g.fillRect(0, 0, W, H);
    g.fillStyle(0x3a3054, 0.4);
    g.fillEllipse(W / 2, H * 0.75, W * 1.2, H * 0.5);
  }

  private drawStars(W: number, maxY: number) {
    for (let i = 0; i < 50; i++) {
      const star = this.add
        .circle(Math.random() * W, Math.random() * maxY, Math.random() < 0.8 ? 1 : 2, 0xffffff, 0.7)
        .setDepth(1);
      this.tweens.add({
        targets: star,
        alpha: 0.15,
        duration: 900 + Math.random() * 2000,
        yoyo: true,
        repeat: -1,
        delay: Math.random() * 2000,
      });
    }
  }

  private drawMountains(W: number, topY: number) {
    const g = this.add.graphics().setDepth(2);
    for (const L of [
      { color: 0x232a44, amp: this.minDim * 0.09, base: topY - this.minDim * 0.01 },
      { color: 0x1a2136, amp: this.minDim * 0.14, base: topY + this.minDim * 0.03 },
    ]) {
      g.fillStyle(L.color, 1);
      const pts: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(0, topY + this.minDim)];
      const step = W / 11;
      for (let x = 0, i = 0; x <= W + step; x += step, i++) {
        pts.push(new Phaser.Math.Vector2(x, L.base - Math.abs(Math.sin(i * 1.7)) * L.amp));
      }
      pts.push(new Phaser.Math.Vector2(W, topY + this.minDim));
      g.fillPoints(pts, true);
    }
  }

  // ---------- 星球 ----------

  /** 球体本体 + 表面细节（草丛/石块），细节随球转，转动才看得见 */
  private drawPlanetSurface() {
    const R = this.planetR;
    const g = this.add.graphics();
    // 土层底 → 草面 → 边缘高光，画在容器里随球旋转
    g.fillStyle(0x2a1c10, 1);
    g.fillCircle(0, 0, R);
    g.fillStyle(0x3c6532, 1);
    g.fillCircle(0, 0, R * 0.985);
    g.fillStyle(0x33552b, 1);
    g.fillCircle(0, 0, R * 0.93);
    g.lineStyle(3, 0x6ea45a, 0.5);
    g.strokeCircle(0, 0, R * 0.985);
    this.planet.add(g);

    // 草丛：贴着球面随机角度的小三角
    const tufts = this.add.graphics();
    tufts.fillStyle(0x77b060, 0.9);
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = R * (0.94 + Math.random() * 0.045);
      const x = Math.sin(a) * rr;
      const y = -Math.cos(a) * rr;
      const s = this.minDim * (0.004 + Math.random() * 0.004);
      // 小三角尖朝球外
      const ox = Math.sin(a);
      const oy = -Math.cos(a);
      tufts.fillTriangle(
        x - oy * s, y + ox * s,
        x + oy * s, y - ox * s,
        x + ox * s * 2.4, y + oy * s * 2.4,
      );
    }
    this.planet.add(tufts);

    // 石块与土斑：更深一圈，增加旋转视差
    const rocks = this.add.graphics();
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = R * (0.8 + Math.random() * 0.1);
      rocks.fillStyle(i % 2 ? 0x2c4a26 : 0x27411f, 0.9);
      rocks.fillCircle(Math.sin(a) * rr, -Math.cos(a) * rr, this.minDim * (0.006 + Math.random() * 0.008));
    }
    this.planet.add(rocks);
  }

  /** 6 个据点钉在球面：theta 均分整圈，容器旋转 = 据点绕球走 */
  private buildPois() {
    const R = this.planetR;
    const count = HALL_MAP.length;
    const fontSize = this.minDim < 620 ? "12px" : "24px";

    HALL_MAP.forEach((poi, i) => {
      const theta = (i / count) * Math.PI * 2;
      const node = this.add.container(Math.sin(theta) * R, -Math.cos(theta) * R);
      node.setRotation(theta); // 「站」在球面上，头朝球外

      const w = this.minDim * 0.1;
      const h = this.minDim * 0.09;

      // 洞口拱门；战争沙盘（地下城入口）配旋转漩涡，像贪婪洞窟的洞口
      const arch = this.add.graphics();
      arch.fillStyle(0x120d08, 0.95);
      arch.fillRoundedRect(-w / 2, -h, w, h, { tl: w / 2, tr: w / 2, bl: 3, br: 3 });
      arch.lineStyle(2, 0x8a6a34, 0.9);
      arch.strokeRoundedRect(-w / 2, -h, w, h, { tl: w / 2, tr: w / 2, bl: 3, br: 3 });
      node.add(arch);

      if (poi.kind === "tower") {
        const spiral = this.add.graphics();
        spiral.lineStyle(2, 0xc23a24, 0.9);
        spiral.beginPath();
        const sr = w * 0.3;
        for (let t = 0; t <= 1; t += 0.02) {
          const a = t * Math.PI * 2 * 3;
          const px = Math.cos(a) * sr * (1 - t);
          const py = Math.sin(a) * sr * (1 - t);
          if (t === 0) spiral.moveTo(px, py);
          else spiral.lineTo(px, py);
        }
        spiral.strokePath();
        spiral.setPosition(0, -h * 0.55);
        node.add(spiral);
        this.tweens.add({ targets: spiral, angle: 360, duration: 7000, repeat: -1 });
      } else {
        const icon = this.add
          .image(0, -h * 0.55, POI_SPRITE[poi.kind])
          .setScale(this.minDim * 0.006);
        node.add(icon);
      }

      const halo = this.add.circle(0, -h * 0.55, this.minDim * 0.065, 0xd4a64d, 0);
      halo.setStrokeStyle(2, 0xd4a64d, 0.0);
      node.add(halo);

      const label = this.add
        .text(0, this.minDim * 0.016, poi.label, {
          fontFamily: '"ArkPixel", monospace',
          fontSize,
          color: "#f0e4c4",
        })
        .setOrigin(0.5, 0)
        .setResolution(3);
      node.add(label);

      this.planet.add(node);
      this.poiNodes.push({ poi, theta, node, halo });
    });
  }

  // ---------- 交互 ----------

  private setupDrag() {
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.dragLastX = p.x;
      this.dragLastT = performance.now();
      this.dragMoved = 0;
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      const now = performance.now();
      const dx = p.x - this.dragLastX;
      this.dragLastX = p.x;
      this.dragMoved += Math.abs(dx);
      const dphi = dx / this.planetR;
      this.rot += dphi;
      // 角速度用事件自身的时间差估计。不能用 game.loop.delta——
      // 一帧内可能连发几十个 move（拖拽工具/高刷触屏），按帧间隔算会放大几十倍，
      // 松手后的惯性直接转飞。再加物理上限兜底。
      const dtMs = Math.max(now - this.dragLastT, 4);
      this.dragLastT = now;
      const inst = dphi / (dtMs / 1000);
      this.omega = Phaser.Math.Clamp(0.75 * this.omega + 0.25 * inst, -3, 3);
      this.applyRotation();
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      const wasTap = this.dragMoved < TAP_SLOP;
      this.dragging = false;
      if (wasTap) {
        this.omega = 0;
        this.tapAt(p.x, p.y);
      }
      // 非 tap：保留 omega 惯性，update 里衰减
    });
  }

  /** 点按命中：手动算世界坐标距离，绕开旋转容器的命中区问题（触屏友好） */
  private tapAt(px: number, py: number) {
    const R = this.planetR;
    for (const pn of this.poiNodes) {
      const a = pn.theta + this.rot;
      const wx = this.center.x + Math.sin(a) * R;
      const wy = this.center.y - Math.cos(a) * R;
      if (Phaser.Math.Distance.Between(px, py, wx, wy) < this.minDim * 0.1) {
        this.enterPoi(pn.poi);
        return;
      }
    }
  }

  private enterPoi(poi: Poi) {
    const action = POI_ACTION[poi.kind];
    if (action.mode === "window") {
      announceGame({ type: "open-window", window: action.window });
    } else {
      const bootstrap = this.registry.get("bootstrap") as GameBootstrap;
      announceGame({ type: "leave-game", href: action.href(bootstrap) });
    }
  }

  private applyRotation() {
    this.planet.setRotation(this.rot);
  }

  // ---------- 主循环：惯性、动画、颠簸、聚焦高亮 ----------

  update(_time: number, delta: number) {
    // 惯性：松手后角速度指数衰减
    if (!this.dragging && Math.abs(this.omega) > 0.015) {
      this.rot += this.omega * (delta / 1000);
      this.omega *= Math.exp(-delta / INERTIA_TAU);
      this.applyRotation();
    } else if (!this.dragging) {
      this.omega = 0;
    }

    // 角色动画随转速：世界在脚下转 = 人在走。方向 = 逆着地面运动的方向
    const speed = Math.abs(this.omega);
    if (speed < WALK_W) {
      this.hero.play("hero-idle-down", true);
    } else {
      const anim = speed >= RUN_W ? "hero-run-side" : "hero-walk-side";
      this.hero.setFlipX(this.omega > 0);
      this.hero.play(anim, true);
    }

    // 行走颠簸：速度越快频率越高、幅度越大（run 更明显）
    if (speed >= WALK_W) {
      this.bobPhase += delta * 0.012 * (1 + speed);
      const amp = this.minDim * (speed >= RUN_W ? 0.006 : 0.003);
      this.cameras.main.setScroll(
        Math.sin(this.bobPhase * 1.7) * amp * 0.4,
        -Math.abs(Math.sin(this.bobPhase)) * amp,
      );
    } else {
      this.cameras.main.setScroll(0, 0);
    }

    // 转到正前方（球顶）的据点高亮
    for (const pn of this.poiNodes) {
      const off = Math.abs(Phaser.Math.Angle.Wrap(pn.theta + this.rot));
      const focus = off < 0.35;
      pn.halo.setStrokeStyle(2, 0xd4a64d, focus ? 0.85 : 0);
      pn.halo.setFillStyle(0xd4a64d, focus ? 0.12 : 0);
      pn.node.setScale(focus ? 1.12 : 1);
    }
  }
}
