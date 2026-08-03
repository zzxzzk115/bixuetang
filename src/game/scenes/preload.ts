import Phaser from "phaser";

// 加载全部像素素材 + 进度条。素材复用课程页地下城那批 0x72 贴图（CC0）。
// 角色行走帧（knight idle/run）在 G1 手动入库后加入这里。

const ASSET_ROOT = "/assets/pixel-dungeon";

/** 单帧贴图：key → 文件名 */
const IMAGES: Record<string, string> = {
  wall: "wall_center.png",
  wallTop: "wall_top_center.png",
  wallFront: "wall_front.png",
  floor: "floor_plain.png",
  floorStain: "floor_stain_1.png",
  column: "column.png",
  torch1: "torch_1.png",
  torch2: "torch_2.png",
  torch3: "torch_3.png",
  torch4: "torch_4.png",
  chestClosed: "chest_golden_closed.png",
  chestOpen: "chest_golden_open_full.png",
  sword: "weapon_sword_golden.png",
  sage: "npc_sage.png",
  skeleton: "monster_skelet.png",
  orc: "monster_orc.png",
  zombie: "monster_zombie.png",
  darkKnight: "monster_dark_knight.png",
  demon: "monster_demon.png",
};

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

    for (const [key, file] of Object.entries(IMAGES)) {
      this.load.image(key, `${ASSET_ROOT}/${file}`);
    }
  }

  create() {
    this.scene.start("hall");
  }
}
