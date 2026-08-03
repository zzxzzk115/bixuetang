import Phaser from "phaser";
import type {
  CourseSummaryDto,
  GameBootstrap,
} from "@/lib/game/bootstrap-types";
import { announceGame } from "@/lib/game/bridge";

// 路线地图：多邻国式的完整纵向地图。
//
// 选定一条冒险路径后，它的全部课程按蜿蜒 S 形从上到下排成节点；
// 已通关 = 金色宝箱，当前进度 = 怪物节点 + 角色站在旁边，之后 = 剪影锁定。
// 拖拽/滚轮纵向滚动浏览全图，点当前或已通关节点进入课程。
// 像素风（0x72 素材），竖屏天然适配，横屏居中同布局。

/** 节点纵向间距与蜿蜒幅度按屏幕短边取比例 */
const SPACING_F = 0.24;
const TAP_SLOP = 10;

interface MapNode {
  course: CourseSummaryDto;
  x: number;
  y: number;
  /** locked = 在当前进度之后 */
  state: "done" | "current" | "locked";
}

export class MapScene extends Phaser.Scene {
  private nodes: MapNode[] = [];
  private pathId = "";
  private worldH = 0;
  private dragLastY = 0;
  private dragMoved = 0;
  private dragging = false;
  private hero?: Phaser.GameObjects.Sprite;

  constructor() {
    super("map");
  }

  init(data: { pathId?: string }) {
    // 场景可带参重启（切换路线）；否则用注册表里记的或第一条
    const bootstrap = this.registry.get("bootstrap") as GameBootstrap;
    this.pathId =
      data?.pathId ??
      (this.registry.get("route") as string | undefined) ??
      bootstrap.paths[0]?.id ??
      "";
    this.registry.set("route", this.pathId);
  }

  create() {
    this.nodes = [];
    this.dragging = false;

    const bootstrap = this.registry.get("bootstrap") as GameBootstrap;
    const path =
      bootstrap.paths.find((p) => p.id === this.pathId) ?? bootstrap.paths[0];
    if (!path) return;
    const byId = new Map(bootstrap.courses.map((c) => [c.id, c]));
    const courses = path.courseIds
      .map((id) => byId.get(id))
      .filter((c): c is CourseSummaryDto => !!c);

    const { width: W, height: H } = this.scale.gameSize;
    const minDim = Math.min(W, H);
    const spacing = minDim * SPACING_F;
    const topPad = minDim * 0.3;
    const amp = Math.min(W * 0.26, minDim * 0.3);
    this.worldH = topPad + (courses.length - 1) * spacing + minDim * 0.5;

    // 当前进度 = 第一门未通关课程
    const currentIdx = Math.max(
      0,
      courses.findIndex((c) => c.status !== "done"),
    );

    this.drawBackdrop(W, Math.max(H, this.worldH));

    // 节点坐标：S 形蜿蜒
    courses.forEach((course, i) => {
      const x = W / 2 + Math.sin(i * 1.15) * amp;
      const y = topPad + i * spacing;
      const state: MapNode["state"] =
        course.status === "done" ? "done" : i === currentIdx ? "current" : "locked";
      this.nodes.push({ course, x, y, state });
    });

    this.drawTrail();
    this.drawDecor(W, minDim, spacing);
    this.nodes.forEach((n, i) => this.drawNode(n, i, minDim));
    this.drawTitle(path.title, W, minDim);

    // 相机：纵向滚动，初始定位到当前节点
    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, Math.max(this.worldH, H));
    const cur = this.nodes[currentIdx];
    if (cur) cam.centerOn(W / 2, cur.y);

    this.setupScroll();
    this.scale.on("resize", this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.onResize, this);
    });
  }

  private onResize = () => {
    this.scene.restart({ pathId: this.pathId });
  };

  // ---------- 视觉 ----------

  private drawBackdrop(W: number, totalH: number) {
    const g = this.add.graphics().setDepth(0);
    g.fillGradientStyle(0x101726, 0x101726, 0x1c1526, 0x1c1526, 1);
    g.fillRect(0, 0, W, totalH);
    // 星星铺满整张长图（世界坐标，随地图滚动，天然有移动感）
    for (let i = 0; i < Math.ceil(totalH / 12); i++) {
      const star = this.add
        .circle(
          Math.random() * W,
          Math.random() * totalH,
          Math.random() < 0.85 ? 1 : 2,
          0xffffff,
          0.6,
        )
        .setDepth(1);
      this.tweens.add({
        targets: star,
        alpha: 0.1,
        duration: 1000 + Math.random() * 2200,
        yoyo: true,
        repeat: -1,
        delay: Math.random() * 2000,
      });
    }
  }

  /** 节点间的虚线路径（贝塞尔中点弯一下，像地图上的小路） */
  private drawTrail() {
    const g = this.add.graphics().setDepth(2);
    for (let i = 0; i < this.nodes.length - 1; i++) {
      const a = this.nodes[i];
      const b = this.nodes[i + 1];
      const lit = a.state === "done";
      g.lineStyle(3, lit ? 0xd4a64d : 0x3a4252, lit ? 0.8 : 0.7);
      const curve = new Phaser.Curves.QuadraticBezier(
        new Phaser.Math.Vector2(a.x, a.y),
        new Phaser.Math.Vector2((a.x + b.x) / 2, (a.y + b.y) / 2 + 14),
        new Phaser.Math.Vector2(b.x, b.y),
      );
      // 手动取点画成点线
      const pts = curve.getPoints(16);
      for (let k = 0; k < pts.length; k += 2) {
        g.fillStyle(lit ? 0xd4a64d : 0x3a4252, lit ? 0.9 : 0.7);
        g.fillCircle(pts[k].x, pts[k].y, 3);
      }
    }
  }

  /** 路边点缀：火把/石柱/地渍交替出现在节点对侧 */
  private drawDecor(W: number, minDim: number, spacing: number) {
    this.nodes.forEach((n, i) => {
      if (i % 2 === 0) return;
      const side = n.x > W / 2 ? -1 : 1;
      const dx = side * Math.min(W * 0.3, minDim * 0.34);
      const key = i % 4 === 1 ? "torch" : i % 4 === 3 ? "column" : "floorStain";
      this.add
        .image(n.x + dx, n.y + spacing * 0.4, key)
        .setDepth(3)
        .setScale(minDim * 0.004)
        .setAlpha(0.85);
    });
  }

  private drawNode(n: MapNode, index: number, minDim: number) {
    const r = minDim * 0.062;

    // 底盘
    const plate = this.add.graphics().setDepth(4);
    plate.fillStyle(n.state === "locked" ? 0x1c2230 : 0x243046, 1);
    plate.fillCircle(n.x, n.y, r);
    plate.lineStyle(
      3,
      n.state === "done" ? 0xd4a64d : n.state === "current" ? 0x6ca4aa : 0x39445a,
      1,
    );
    plate.strokeCircle(n.x, n.y, r);

    // 节点主体
    const spriteKey =
      n.state === "done"
        ? "chestOpen"
        : ["skeleton", "orc", "zombie", "darkKnight", "demon"][index % 5];
    const icon = this.add
      .image(n.x, n.y - r * 0.1, spriteKey)
      .setDepth(5)
      .setScale(minDim * 0.005);
    if (n.state === "locked") {
      // Phaser 4 的 setTintFill 不再收颜色参数：先 setTint 定色再切换填充模式
      icon.setTint(0x2a3244);
      icon.setTintFill();
    }

    // 当前节点：呼吸光环 + 角色站在旁边
    if (n.state === "current") {
      const ring = this.add
        .circle(n.x, n.y, r * 1.35, 0x6ca4aa, 0)
        .setStrokeStyle(3, 0x8fd0d8, 0.9)
        .setDepth(4);
      this.tweens.add({
        targets: ring,
        scale: 1.18,
        alpha: 0.4,
        duration: 1100,
        yoyo: true,
        repeat: -1,
        ease: "Sine.InOut",
      });
      this.hero = this.add
        .sprite(n.x - r * 2.1, n.y + r * 0.7, "hero", "walk-down-3.png")
        .setOrigin(0.5, 1)
        .setScale(minDim * 0.0058)
        .setDepth(6);
      this.hero.play("hero-idle-down");
      this.tweens.add({
        targets: this.hero,
        y: this.hero.y - 3,
        duration: 1500,
        yoyo: true,
        repeat: -1,
        ease: "Sine.InOut",
      });
    }

    // 通关小旗标
    if (n.state === "done") {
      this.add
        .text(n.x + r * 0.9, n.y - r * 1.1, "✓", {
          fontFamily: '"ArkPixel", monospace',
          fontSize: "12px",
          color: "#7fd39a",
        })
        .setDepth(6)
        .setResolution(3);
    }

    // 标题 + 进度
    const fontSize = minDim < 620 ? "12px" : "24px";
    this.add
      .text(n.x, n.y + r * 1.35, n.course.title, {
        fontFamily: '"ArkPixel", monospace',
        fontSize,
        color: n.state === "locked" ? "#5a6478" : "#f0e4c4",
        align: "center",
        wordWrap: { width: minDim * 0.42, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 0)
      .setDepth(6)
      .setResolution(3);
    this.add
      .text(
        n.x,
        n.y + r * 1.35 + (minDim < 620 ? 16 : 30),
        `${n.course.watchedCount}/${n.course.episodeCount}`,
        {
          fontFamily: '"ArkPixel", monospace',
          fontSize: "12px",
          color: n.state === "locked" ? "#454e60" : "#9aa8bd",
        },
      )
      .setOrigin(0.5, 0)
      .setDepth(6)
      .setResolution(3);
  }

  private drawTitle(title: string, W: number, minDim: number) {
    // 顶部路线名横幅（世界坐标顶部，滚上去就让位给地图）
    this.add
      .text(W / 2, minDim * 0.1, title, {
        fontFamily: '"ArkPixel", monospace',
        fontSize: minDim < 620 ? "24px" : "36px",
        color: "#e9ddba",
      })
      .setOrigin(0.5)
      .setDepth(6)
      .setResolution(2);
  }

  // ---------- 交互：纵向拖拽/滚轮 + 点节点 ----------

  private setupScroll() {
    const cam = this.cameras.main;
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.dragLastY = p.y;
      this.dragMoved = 0;
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      const dy = p.y - this.dragLastY;
      this.dragLastY = p.y;
      this.dragMoved += Math.abs(dy);
      cam.scrollY -= dy;
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      this.dragging = false;
      if (this.dragMoved < TAP_SLOP) this.tapAt(p.x, p.y + cam.scrollY);
    });
    this.input.on(
      "wheel",
      (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
        cam.scrollY += dy * 0.6;
      },
    );
  }

  private tapAt(wx: number, wy: number) {
    const minDim = Math.min(this.scale.gameSize.width, this.scale.gameSize.height);
    const hitR = minDim * 0.09;
    for (const n of this.nodes) {
      if (Phaser.Math.Distance.Between(wx, wy, n.x, n.y) < hitR) {
        if (n.state === "locked") {
          // 锁定节点抖一下表示还没到
          this.cameras.main.shake(120, 0.004);
          return;
        }
        announceGame({ type: "leave-game", href: `/courses/${n.course.id}` });
        return;
      }
    }
  }
}
