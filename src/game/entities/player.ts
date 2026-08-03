import Phaser from "phaser";
import { TILE, cellCenter, pixelToCell } from "@/lib/game/hall-map";
import { findPath, type Vec2 } from "@/lib/game/pathfind";

// 可行走角色。两种驱动共存：
//   · 桌面：方向键/WASD 直接控速度（连续微调）
//   · 移动端 + 桌面点击：tap-to-move，BFS 出格路径后逐格走
// 键盘一有输入就打断当前寻路——两者不打架。

const SPEED = 78; // 像素/秒
const ARRIVE = 2; // 到达格中心的容差

export class Player {
  readonly sprite: Phaser.GameObjects.Image;
  private path: Vec2[] = [];
  private grid: boolean[][];

  constructor(scene: Phaser.Scene, grid: boolean[][], spawn: Vec2, texture: string) {
    this.grid = grid;
    const at = cellCenter(spawn.col, spawn.row);
    this.sprite = scene.add.image(at.x, at.y, texture).setDepth(10);
    // 素材是 16px，放到 ~20px，脚底当锚点便于站在地板格上
    this.sprite.setScale(1.25).setOrigin(0.5, 0.8);
  }

  /** 点击寻路：目标像素坐标 → 格路径 */
  walkTo(x: number, y: number) {
    const from = pixelToCell(this.sprite.x, this.sprite.y);
    const to = pixelToCell(x, y);
    const path = findPath(this.grid, from, to);
    if (!path) return;
    // 丢掉起点格，从下一格开始走
    this.path = path.slice(1);
  }

  /** 每帧调用。keyVec 是键盘方向（-1/0/1），非零则接管、清空寻路 */
  update(delta: number, keyVec: Vec2) {
    const step = (SPEED * delta) / 1000;

    if (keyVec.col !== 0 || keyVec.row !== 0) {
      this.path = [];
      this.moveByKeys(keyVec, step);
      return;
    }
    if (this.path.length > 0) this.followPath(step);
  }

  private moveByKeys(dir: Vec2, step: number) {
    const nx = this.sprite.x + dir.col * step;
    const ny = this.sprite.y + dir.row * step;
    // 逐轴判可走，撞墙只停被挡的那个轴（能贴墙滑行）
    const cx = pixelToCell(nx, this.sprite.y);
    if (this.walkable(cx.col, cx.row)) this.sprite.x = nx;
    const cy = pixelToCell(this.sprite.x, ny);
    if (this.walkable(cy.col, cy.row)) this.sprite.y = ny;
  }

  private followPath(step: number) {
    const next = this.path[0];
    const target = cellCenter(next.col, next.row);
    const dx = target.x - this.sprite.x;
    const dy = target.y - this.sprite.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= ARRIVE || dist <= step) {
      this.sprite.setPosition(target.x, target.y);
      this.path.shift();
      return;
    }
    this.sprite.x += (dx / dist) * step;
    this.sprite.y += (dy / dist) * step;
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

  /** 当前所在格，判 POI 触发用 */
  cell(): Vec2 {
    return pixelToCell(this.sprite.x, this.sprite.y);
  }

  /** 与某点的像素距离 */
  distanceTo(x: number, y: number): number {
    return Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, x, y);
  }

  static tileSize() {
    return TILE;
  }
}
