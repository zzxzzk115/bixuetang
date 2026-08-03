import Phaser from "phaser";

// 极简引导场景：字体已由 GameShell 在建 Game 前 await 就位，这里只负责
// 立刻切到 Preload。留一个独立 boot 是为了给后续（如读设置、选存档）留扩展位。

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  create() {
    this.scene.start("preload");
  }
}
