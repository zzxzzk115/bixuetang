import Phaser from "phaser";
import { TILE, cellCenter, pixelToCell } from "@/lib/game/hall-map";
import { findPath, type Vec2 } from "@/lib/game/pathfind";

// 可行走角色。两种驱动共存：
//   · 桌面：方向键/WASD 直接控速度
//   · 点击/触摸：tap-to-move，BFS 出格路径后逐格走
// 键盘一有输入就打断当前寻路。移动时按方向播 run 动画，静止播 idle。

const SPEED = 82; // 像素/秒
const ARRIVE = 2;

export class Player {
  readonly sprite: Phaser.GameObjects.Sprite;
  private path: Vec2[] = [];
  private grid: boolean[][];
  private facing: "down" | "up" | "side" = "down";

  constructor(scene: Phaser.Scene, grid: boolean[][], spawn: Vec2) {
    this.grid = grid;
    const at = cellCenter(spawn.col, spawn.row);
    this.sprite = scene.add.sprite(at.x, at.y, "hero", "walk-down-3.png");
    this.sprite.setDepth(10).setOrigin(0.5, 0.72);
    this.sprite.play("hero-idle");
  }

  walkTo(x: number, y: number) {
    const from = pixelToCell(this.sprite.x, this.sprite.y);
    const to = pixelToCell(x, y);
    const path = findPath(this.grid, from, to);
    if (!path) return;
    this.path = path.slice(1);
  }

  update(delta: number, keyVec: Vec2) {
    const step = (SPEED * delta) / 1000;
    let moved: Vec2 = { col: 0, row: 0 };

    if (keyVec.col !== 0 || keyVec.row !== 0) {
      this.path = [];
      moved = this.moveByKeys(keyVec, step);
    } else if (this.path.length > 0) {
      moved = this.followPath(step);
    }

    this.animate(moved);
  }

  private moveByKeys(dir: Vec2, step: number): Vec2 {
    const before = { x: this.sprite.x, y: this.sprite.y };
    const nx = this.sprite.x + dir.col * step;
    const ny = this.sprite.y + dir.row * step;
    const cx = pixelToCell(nx, this.sprite.y);
    if (this.walkable(cx.col, cx.row)) this.sprite.x = nx;
    const cy = pixelToCell(this.sprite.x, ny);
    if (this.walkable(cy.col, cy.row)) this.sprite.y = ny;
    return { col: this.sprite.x - before.x, row: this.sprite.y - before.y };
  }

  private followPath(step: number): Vec2 {
    const next = this.path[0];
    const target = cellCenter(next.col, next.row);
    const dx = target.x - this.sprite.x;
    const dy = target.y - this.sprite.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= ARRIVE || dist <= step) {
      const before = { x: this.sprite.x, y: this.sprite.y };
      this.sprite.setPosition(target.x, target.y);
      this.path.shift();
      return { col: this.sprite.x - before.x, row: this.sprite.y - before.y };
    }
    const mx = (dx / dist) * step;
    const my = (dy / dist) * step;
    this.sprite.x += mx;
    this.sprite.y += my;
    return { col: mx, row: my };
  }

  /** 按移动向量选朝向与动画；侧向靠 flipX 复用同一套帧 */
  private animate(moved: Vec2) {
    const moving = Math.abs(moved.col) > 0.01 || Math.abs(moved.row) > 0.01;
    if (!moving) {
      this.sprite.play("hero-idle", true);
      return;
    }
    if (Math.abs(moved.col) >= Math.abs(moved.row)) {
      this.facing = "side";
      this.sprite.setFlipX(moved.col < 0);
      this.sprite.play("hero-side", true);
    } else {
      this.facing = moved.row < 0 ? "up" : "down";
      this.sprite.setFlipX(false);
      this.sprite.play(moved.row < 0 ? "hero-up" : "hero-down", true);
    }
  }

  private walkable(col: number, row: number): boolean {
    return !!this.grid[row]?.[col];
  }

  get x() {
    return this.sprite.x;
  }
  get y() {
    return this.sprite.y;
  }

  cell(): Vec2 {
    return pixelToCell(this.sprite.x, this.sprite.y);
  }

  distanceTo(x: number, y: number): number {
    return Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, x, y);
  }

  static tileSize() {
    return TILE;
  }
}
