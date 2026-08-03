import Phaser from "phaser";

// 加载大厅素材 + 进度条，并建好角色行走动画。
// 素材：DungeonTileset II（0x72，CC0）——tiles 图集切成 16×16 spritesheet，
// hero 是带 side/down/up 三向奔跑动画的 atlas。

const ROOT = "/assets/dungeon-ii";

function runFrames(scene: Phaser.Scene, dir: "down" | "side" | "up") {
  return scene.anims.generateFrameNames("hero", {
    prefix: `run-${dir}-`,
    suffix: ".png",
    start: 1,
    end: 8,
  });
}

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super("preload");
  }

  preload() {
    const { width, height } = this.scale.gameSize;
    const barBg = this.add
      .rectangle(width / 2, height / 2, 160, 8, 0x1b241d)
      .setStrokeStyle(1, 0x4a554d);
    const bar = this.add
      .rectangle(width / 2 - 78, height / 2, 4, 4, 0xd4a64d)
      .setOrigin(0, 0.5);
    this.load.on("progress", (p: number) => {
      bar.width = Math.max(4, 152 * p);
    });
    this.load.on("complete", () => {
      barBg.destroy();
      bar.destroy();
    });

    this.load.spritesheet("tiles", `${ROOT}/tiles.png`, {
      frameWidth: 16,
      frameHeight: 16,
    });
    this.load.atlas("hero", `${ROOT}/hero.png`, `${ROOT}/hero.json`);

    // 据点用的装饰图标沿用旧 0x72 tileset（已在库）
    const icons: Record<string, string> = {
      column: "column.png",
      sword: "weapon_sword_golden.png",
      chestClosed: "chest_golden_closed.png",
      chestOpen: "chest_golden_open_full.png",
      torch: "torch_1.png",
      sage: "npc_sage.png",
      floorStain: "floor_stain_1.png",
      skeleton: "monster_skelet.png",
      orc: "monster_orc.png",
      zombie: "monster_zombie.png",
      darkKnight: "monster_dark_knight.png",
      demon: "monster_demon.png",
    };
    for (const [key, file] of Object.entries(icons)) {
      this.load.image(key, `/assets/pixel-dungeon/${file}`);
    }
  }

  create() {
    // 三态 × 三向：idle 用单帧，walk/run 复用同一组 run 帧、只差帧率。
    for (const dir of ["down", "side", "up"] as const) {
      this.anims.create({
        key: `hero-walk-${dir}`,
        frames: runFrames(this, dir),
        frameRate: 8,
        repeat: -1,
      });
      this.anims.create({
        key: `hero-run-${dir}`,
        frames: runFrames(this, dir),
        frameRate: 15,
        repeat: -1,
      });
      this.anims.create({
        key: `hero-idle-${dir}`,
        frames: [{ key: "hero", frame: `walk-${dir}-3.png` }],
        frameRate: 1,
      });
    }

    this.scene.start("map");
  }
}
