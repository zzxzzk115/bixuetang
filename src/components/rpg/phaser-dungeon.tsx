"use client";

import { useEffect, useRef } from "react";
import {
  Coins,
  Crosshair,
  Eye,
  Shield,
  Sparkles,
  Timer,
} from "lucide-react";
import { ENCOUNTER_LABEL, type EpisodeLoot } from "@/lib/game/rpg";
import { RPG_LOOT_EVENT } from "@/lib/game/rpg-events";

interface DungeonProfile {
  coins: number;
  stats: {
    insight: number;
    focus: number;
    precision: number;
    resolve: number;
    power: number;
  };
}

const ASSET_ROOT = "/assets/pixel-dungeon";

// 方舟像素字体（见 public/fonts/README.md）。
// 画布里的中文原先用微软雅黑画在 6-7px，矢量字体在这个尺寸下笔画糊成一团，
// 再被 Phaser 的 FIT 缩放放大就更糊。像素字体必须按设计尺寸 12px 用，
// 换成别的数值会重新引入重采样模糊。
// 也不能加 fontStyle:"bold"——像素字体没有粗体字重，浏览器会做合成加粗，
// 那等于把每个笔画横向涂抹一次，前功尽弃。
const PIXEL_FONT = '"ArkPixel", ui-monospace, monospace';
const PIXEL_FONT_SIZE = "12px";
const MONSTERS = [
  { key: "skeleton", file: "monster_skelet.png", title: "骸骨守卫" },
  { key: "orc", file: "monster_orc.png", title: "兽人斥候" },
  { key: "zombie", file: "monster_zombie.png", title: "遗忘学徒" },
] as const;

export function PhaserDungeon({
  courseCode,
  episodeN,
  episodeTitle,
  loot,
  profile,
  loggedIn,
}: {
  courseCode: string;
  episodeN: number;
  episodeTitle: string;
  loot: EpisodeLoot;
  profile: DungeonProfile;
  loggedIn: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const encounterType = loot.encounterType;
  const itemId = loot.item.id;
  const itemTitle = loot.item.title;
  const rewardCoins = loot.coins;

  useEffect(() => {
    let game: import("phaser").Game | undefined;
    let cancelled = false;

    async function mount() {
      // 必须先把像素字体加载完再建场景：Phaser 建 Text 时会立刻量字并烘成贴图，
      // 字体没就位就会用回退字体量错宽度，之后换字也不会重排。
      try {
        await document.fonts.load(`${PIXEL_FONT_SIZE} ${PIXEL_FONT}`);
        await document.fonts.ready;
      } catch {
        // 字体加载失败就让它退回等宽字体，不该因此把整个地下城拦下
      }
      const PhaserModule = await import("phaser");
      if (cancelled || !hostRef.current) return;
      const Phaser = PhaserModule.default;

      class DungeonScene extends Phaser.Scene {
        constructor() {
          super("guild-dungeon");
        }

        preload() {
          const assets = {
            wall: "wall_center.png",
            wallTop: "wall_top_center.png",
            wallFront: "wall_front.png",
            floor: "floor_plain.png",
            floorStain: "floor_stain_1.png",
            column: "column.png",
            sage: "npc_sage.png",
            skeleton: "monster_skelet.png",
            orc: "monster_orc.png",
            zombie: "monster_zombie.png",
            elite: "monster_dark_knight.png",
            boss: "monster_demon.png",
            chest: "chest_golden_closed.png",
            chestOpen: "chest_golden_open_full.png",
            sword: "weapon_sword_golden.png",
            torch1: "torch_1.png",
            torch2: "torch_2.png",
            torch3: "torch_3.png",
            torch4: "torch_4.png",
          };
          for (const [key, file] of Object.entries(assets)) {
            this.load.image(key, `${ASSET_ROOT}/${file}`);
          }
        }

        create() {
          const width = 480;
          const height = 170;

          const wall = this.add
            .tileSprite(0, 0, width, 116, "wall")
            .setOrigin(0);
          wall.tileScaleX = 2;
          wall.tileScaleY = 2;

          const wallTop = this.add
            .tileSprite(0, 0, width, 20, "wallTop")
            .setOrigin(0);
          wallTop.tileScaleX = 2;
          wallTop.tileScaleY = 2;

          const floor = this.add
            .tileSprite(0, 112, width, 58, "floor")
            .setOrigin(0);
          floor.tileScaleX = 2;
          floor.tileScaleY = 2;

          for (let x = 18; x < width; x += 82) {
            this.add.image(x, 137, "floorStain").setScale(2);
          }

          this.add
            .tileSprite(0, 104, width, 18, "wallFront")
            .setOrigin(0)
            .setScale(2, 1);

          this.add.image(30, 84, "column").setScale(2.5);
          this.add.image(450, 84, "column").setScale(2.5);

          const torchLeft = this.add.image(48, 54, "torch1").setScale(2.1);
          const torchRight = this.add.image(432, 54, "torch1").setScale(2.1);
          const torchFrames = ["torch1", "torch2", "torch3", "torch4"];
          let torchFrame = 0;
          this.time.addEvent({
            delay: 120,
            loop: true,
            callback: () => {
              torchFrame = (torchFrame + 1) % torchFrames.length;
              torchLeft.setTexture(torchFrames[torchFrame]);
              torchRight.setTexture(torchFrames[torchFrame]);
            },
          });

          this.add.rectangle(240, 85, width, height, 0x020403, 0.2);
          this.add
            .rectangle(240, 161, width, 18, 0x050806, 0.62)
            .setStrokeStyle(1, 0x4a4535, 0.8);

          const roomFrame = this.add.graphics();
          roomFrame.lineStyle(1, 0x7e6a3d, 0.65);
          roomFrame.strokeRect(5, 5, width - 10, height - 10);
          roomFrame.lineStyle(1, 0x232c26, 0.8);
          roomFrame.lineBetween(60, 119, 420, 119);

          const heroShadow = this.add.ellipse(116, 133, 54, 10, 0x000000, 0.5);
          const hero = this.add.image(116, 111, "sage").setScale(4.3);
          hero.setOrigin(0.5, 0.75);
          const sword = this.add
            .image(145, 104, "sword")
            .setScale(2.3)
            .setRotation(0.45);
          this.add
            .text(116, 62, "学者", {
              color: "#d9c58d",
              fontFamily: PIXEL_FONT,
              fontSize: PIXEL_FONT_SIZE,
            })
            .setOrigin(0.5);

          this.tweens.add({
            targets: [hero, sword],
            y: "-=2",
            duration: 900,
            ease: "Sine.InOut",
            yoyo: true,
            repeat: -1,
          });
          this.tweens.add({
            targets: heroShadow,
            scaleX: 0.9,
            alpha: 0.36,
            duration: 900,
            ease: "Sine.InOut",
            yoyo: true,
            repeat: -1,
          });

          const mob = MONSTERS[(episodeN - 1) % MONSTERS.length];
          const enemyConfig =
            encounterType === "cache"
              ? { key: "chest", title: "补给宝箱", scale: 4.2 }
              : encounterType === "boss"
                ? { key: "boss", title: "课程首领", scale: 2.8 }
                : encounterType === "elite"
                  ? { key: "elite", title: "精英守关者", scale: 3.8 }
                  : { key: mob.key, title: mob.title, scale: 4 };

          const enemyShadow = this.add.ellipse(
            367,
            134,
            encounterType === "boss" ? 76 : 58,
            11,
            0x000000,
            0.55,
          );
          const enemy = this.add
            .image(367, 111, enemyConfig.key)
            .setScale(enemyConfig.scale)
            .setOrigin(0.5, 0.75);
          this.add
            .text(367, 60, enemyConfig.title, {
              color: encounterType === "boss" ? "#e67f68" : "#c6bda5",
              fontFamily: PIXEL_FONT,
              fontSize: PIXEL_FONT_SIZE,
            })
            .setOrigin(0.5);

          if (encounterType !== "cache") {
            const hpWidth =
              encounterType === "boss" ? 76 : encounterType === "elite" ? 64 : 52;
            this.add.rectangle(367, 76, hpWidth + 2, 5, 0x080a08, 0.95);
            this.add
              .rectangle(367 - hpWidth / 2, 76, hpWidth, 3, 0x9e493e, 1)
              .setOrigin(0, 0.5);
            this.tweens.add({
              targets: enemy,
              y: "-=2",
              duration: encounterType === "boss" ? 1250 : 1080,
              ease: "Sine.InOut",
              yoyo: true,
              repeat: -1,
            });
          }

          const slash = this.add.arc(
            237,
            103,
            38,
            210,
            345,
            false,
            0xe6b95d,
            0,
          );
          slash.setStrokeStyle(5, 0xe6b95d, 0);

          const rewardText = this.add
            .text(240, 45, "", {
              color: "#f0c665",
              fontFamily: PIXEL_FONT,
              fontSize: PIXEL_FONT_SIZE,
              align: "center",
              stroke: "#080b09",
              strokeThickness: 3,
            })
            .setOrigin(0.5)
            .setAlpha(0);

          const onLoot = (rawEvent: Event) => {
            const event = rawEvent as CustomEvent<EpisodeLoot>;
            const received = event.detail;
            if (!received || received.item.id !== itemId) return;

            this.tweens.killTweensOf(hero);
            this.tweens.killTweensOf(enemy);
            this.tweens.add({
              targets: [hero, sword],
              x: "+=105",
              duration: 210,
              ease: "Quad.Out",
              yoyo: true,
              hold: 80,
            });
            this.tweens.add({
              targets: slash,
              alpha: { from: 0, to: 1 },
              duration: 100,
              yoyo: true,
              delay: 120,
            });

            if (encounterType === "cache") {
              enemy.setTexture("chestOpen");
              this.tweens.add({
                targets: enemy,
                y: "-=6",
                duration: 180,
                yoyo: true,
                delay: 170,
              });
            } else {
              this.tweens.add({
                targets: [enemy, enemyShadow],
                x: "+=18",
                angle: { from: -2, to: 4 },
                alpha: 0.12,
                duration: 390,
                delay: 170,
                ease: "Back.In",
              });
            }

            rewardText.setText(
              `+${received.coins} 金币  ·  ${received.item.title}`,
            );
            this.tweens.add({
              targets: rewardText,
              y: 34,
              alpha: { from: 0, to: 1 },
              duration: 520,
              delay: 380,
              ease: "Cubic.Out",
            });
          };

          window.addEventListener(RPG_LOOT_EVENT, onLoot);
          this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            window.removeEventListener(RPG_LOOT_EVENT, onLoot);
          });

          this.add
            .text(
              12,
              161,
              `${courseCode} / EP.${String(episodeN).padStart(2, "0")}`,
              {
                color: "#9aa39a",
                fontFamily: PIXEL_FONT,
                fontSize: PIXEL_FONT_SIZE,
              },
            )
            .setOrigin(0, 0.5);
          this.add
            .text(468, 161, ENCOUNTER_LABEL[encounterType], {
              color: "#d4a94f",
              fontFamily: PIXEL_FONT,
              fontSize: PIXEL_FONT_SIZE,
            })
            .setOrigin(1, 0.5);

          this.cameras.main.fadeIn(220, 4, 7, 5);
        }
      }

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: hostRef.current,
        width: 480,
        height: 170,
        backgroundColor: "#070a08",
        transparent: false,
        render: {
          antialias: false,
          pixelArt: true,
          roundPixels: true,
        },
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        scene: DungeonScene,
      });
    }

    void mount();
    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  }, [
    courseCode,
    encounterType,
    episodeN,
    itemId,
    itemTitle,
    rewardCoins,
  ]);

  const stats = [
    { label: "洞察", value: profile.stats.insight, icon: Eye },
    { label: "专注", value: profile.stats.focus, icon: Timer },
    { label: "精准", value: profile.stats.precision, icon: Crosshair },
    { label: "意志", value: profile.stats.resolve, icon: Shield },
  ];

  return (
    <section className="dungeon-chamber" aria-label="课程地下城遭遇">
      <div className="dungeon-chamber-head">
        <div>
          <span className="dungeon-kicker">
            ACTIVE CHAMBER // FIXED REWARD
          </span>
          <h2>
            {ENCOUNTER_LABEL[loot.encounterType]} · 第 {episodeN} 集
          </h2>
          <p>{episodeTitle}</p>
        </div>
        <div className="dungeon-reward-preview">
          <span>
            <Coins aria-hidden size={15} /> {loot.coins}
          </span>
          <b data-rarity={loot.item.rarity}>
            <Sparkles aria-hidden size={15} /> {loot.item.title}
          </b>
        </div>
      </div>

      <div className="dungeon-canvas-shell">
        <div ref={hostRef} className="dungeon-canvas" />
        {!loggedIn && (
          <a href="/login" className="dungeon-login-seal">
            登录后完成分集并结算固定战利品
          </a>
        )}
      </div>

      <div className="dungeon-stat-strip">
        <span className="dungeon-power">
          战力 <b>{profile.stats.power}</b>
        </span>
        {stats.map(({ label, value, icon: Icon }) => (
          <span key={label}>
            <Icon aria-hidden size={13} /> {label} <b>{value}</b>
          </span>
        ))}
        <span className="dungeon-coins">
          <Coins aria-hidden size={13} /> 金币 <b>{profile.coins}</b>
        </span>
      </div>
      <p className="dungeon-rule-note">
        公开规则：普通分集掉落学科材料；每 5 集为补给宝箱；每 10
        集为精英；末集为课程首领。无随机数，无账号差异。
      </p>
    </section>
  );
}
