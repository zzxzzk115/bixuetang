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
import {
  ENCOUNTER_LABEL,
  type EpisodeLoot,
} from "@/lib/game/rpg";
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

  useEffect(() => {
    let game: import("phaser").Game | undefined;
    let cancelled = false;

    async function mount() {
      const PhaserModule = await import("phaser");
      if (cancelled || !hostRef.current) return;
      const Phaser = PhaserModule.default;

      class DungeonScene extends Phaser.Scene {
        constructor() {
          super("guild-dungeon");
        }

        create() {
          const width = 960;
          const height = 340;
          const palette = {
            void: 0x070a08,
            stone: 0x151b17,
            mortar: 0x2a342d,
            copper: 0xa96537,
            gold: 0xd7aa50,
            bone: 0xd8d1bd,
            red: 0xa63f3b,
            green: 0x426b4b,
          };

          const room = this.add.graphics();
          room.fillStyle(palette.void, 1).fillRect(0, 0, width, height);
          room.fillStyle(palette.stone, 1).fillRect(0, 36, width, 230);
          for (let y = 42; y < 260; y += 38) {
            room.lineStyle(1, palette.mortar, 0.72);
            room.lineBetween(0, y, width, y);
            const offset = y % 76 === 42 ? 0 : 48;
            for (let x = offset; x < width; x += 96) room.lineBetween(x, y, x, y + 38);
          }
          room.fillStyle(0x0d120f, 1).fillRect(0, 266, width, 74);
          room.lineStyle(2, 0x38443a, 0.8).lineBetween(0, 266, width, 266);
          for (let x = 0; x < width; x += 96) {
            room.lineStyle(1, 0x222b25, 0.75).lineBetween(x, 266, x - 42, height);
          }

          const arch = this.add.graphics();
          arch.lineStyle(18, 0x0d120f, 1);
          arch.strokeRoundedRect(675, 65, 210, 208, 96);
          arch.lineStyle(2, 0x3d473f, 0.9);
          arch.strokeRoundedRect(686, 76, 188, 198, 86);

          const addTorch = (x: number) => {
            const torch = this.add.container(x, 105);
            const metal = this.add.rectangle(0, 24, 6, 38, 0x55483a);
            const glow = this.add.circle(0, 0, 27, palette.copper, 0.14);
            const flame = this.add.triangle(0, 0, -7, 9, 0, -12, 7, 9, palette.gold);
            torch.add([glow, metal, flame]);
            this.tweens.add({
              targets: [glow, flame],
              scaleX: 1.12,
              scaleY: 0.86,
              alpha: { from: 0.72, to: 1 },
              duration: 720,
              yoyo: true,
              repeat: -1,
            });
          };
          addTorch(92);
          addTorch(868);

          const hero = this.add.container(225, 237);
          const heroShadow = this.add.ellipse(0, 25, 92, 20, 0x000000, 0.45);
          const cape = this.add.triangle(-17, -16, -38, 25, 15, 22, -10, -52, 0x263b30);
          const body = this.add.rectangle(0, -14, 42, 70, 0x394f40);
          body.setStrokeStyle(3, 0x9f7b3f);
          const head = this.add.circle(0, -65, 22, palette.bone);
          head.setStrokeStyle(4, 0x282f2a);
          const visor = this.add.rectangle(3, -65, 39, 10, 0x1c2720);
          const eye = this.add.rectangle(13, -65, 7, 3, palette.gold);
          const shield = this.add.polygon(-27, -15, [0, 0, 22, 5, 18, 42, 0, 54, -18, 42, -22, 5], 0x27372d);
          shield.setStrokeStyle(3, 0xb58a42);
          const sword = this.add.rectangle(33, -26, 5, 76, 0xc8c7bd);
          sword.setRotation(0.34);
          const hilt = this.add.rectangle(22, 5, 27, 5, 0xb07b3c);
          hilt.setRotation(0.34);
          hero.add([heroShadow, cape, body, head, visor, eye, shield, sword, hilt]);
          this.tweens.add({
            targets: hero,
            y: 233,
            duration: 1150,
            ease: "Sine.InOut",
            yoyo: true,
            repeat: -1,
          });

          const enemy = this.add.container(735, 226);
          const enemyShadow = this.add.ellipse(0, 34, 118, 23, 0x000000, 0.52);
          enemy.add(enemyShadow);

          if (loot.encounterType === "cache") {
            const chest = this.add.rectangle(0, 1, 112, 63, 0x5f3d27);
            chest.setStrokeStyle(4, palette.gold);
            const lid = this.add.rectangle(0, -34, 116, 29, 0x74482b);
            lid.setStrokeStyle(4, palette.gold);
            const lock = this.add.rectangle(0, -5, 18, 23, palette.gold);
            enemy.add([chest, lid, lock]);
          } else {
            const scale = loot.encounterType === "boss" ? 1.38 : loot.encounterType === "elite" ? 1.18 : 1;
            const cloakColor = loot.encounterType === "boss" ? 0x532322 : loot.encounterType === "elite" ? 0x4b3828 : 0x2d3530;
            const cloak = this.add.triangle(0, 0, -45, 42, 45, 42, 0, -74, cloakColor);
            cloak.setStrokeStyle(3, loot.encounterType === "boss" ? palette.red : 0x69736b);
            const skull = this.add.circle(0, -66, 24, 0xc8c1ac);
            skull.setStrokeStyle(4, 0x252a26);
            const eyeA = this.add.circle(-9, -68, 5, palette.red);
            const eyeB = this.add.circle(9, -68, 5, palette.red);
            const staff = this.add.rectangle(50, -17, 6, 112, 0x6b553a);
            const crest = this.add.polygon(50, -78, [0, -17, 15, 0, 0, 17, -15, 0], loot.encounterType === "boss" ? palette.red : palette.copper);
            enemy.add([cloak, skull, eyeA, eyeB, staff, crest]);
            enemy.setScale(scale);
          }

          const slash = this.add.arc(455, 185, 68, 210, 345, false, palette.gold, 0);
          slash.setStrokeStyle(8, palette.gold, 0);
          const rewardText = this.add
            .text(480, 95, "", {
              color: "#e8bc62",
              fontFamily: "monospace",
              fontSize: "18px",
              fontStyle: "bold",
              align: "center",
            })
            .setOrigin(0.5)
            .setAlpha(0);

          const onLoot = (rawEvent: Event) => {
            const event = rawEvent as CustomEvent<EpisodeLoot>;
            const received = event.detail;
            if (!received || received.item.id !== loot.item.id) return;
            this.tweens.killTweensOf(hero);
            this.tweens.add({
              targets: hero,
              x: 400,
              duration: 210,
              ease: "Quad.Out",
              yoyo: true,
              hold: 90,
            });
            this.tweens.add({
              targets: slash,
              alpha: { from: 0, to: 1 },
              duration: 100,
              yoyo: true,
              delay: 130,
            });
            this.tweens.add({
              targets: enemy,
              x: 760,
              angle: { from: -2, to: 3 },
              alpha: 0.16,
              duration: 390,
              delay: 190,
              ease: "Back.In",
            });
            rewardText.setText(`+${received.coins} COIN  ·  ${received.item.title}`);
            this.tweens.add({
              targets: rewardText,
              y: 72,
              alpha: { from: 0, to: 1 },
              duration: 520,
              delay: 430,
              ease: "Cubic.Out",
            });
          };

          window.addEventListener(RPG_LOOT_EVENT, onLoot);
          this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            window.removeEventListener(RPG_LOOT_EVENT, onLoot);
          });

          this.add
            .text(22, 311, `FIXED ENCOUNTER · ${courseCode} / EP.${String(episodeN).padStart(2, "0")}`, {
              color: "#748077",
              fontFamily: "monospace",
              fontSize: "10px",
            });
          this.add
            .text(938, 311, ENCOUNTER_LABEL[loot.encounterType].toUpperCase(), {
              color: "#c79b4b",
              fontFamily: "monospace",
              fontSize: "10px",
              fontStyle: "bold",
            })
            .setOrigin(1, 0);

          this.cameras.main.fadeIn(280, 5, 8, 6);
        }
      }

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: hostRef.current,
        width: 960,
        height: 340,
        backgroundColor: "#070a08",
        transparent: false,
        render: {
          antialias: true,
          pixelArt: false,
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
  }, [courseCode, episodeN, loot.encounterType, loot.item.id]);

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
          <span className="dungeon-kicker">ACTIVE CHAMBER // FIXED REWARD</span>
          <h2>{ENCOUNTER_LABEL[loot.encounterType]} · 第 {episodeN} 集</h2>
          <p>{episodeTitle}</p>
        </div>
        <div className="dungeon-reward-preview">
          <span><Coins aria-hidden size={15} /> {loot.coins}</span>
          <b data-rarity={loot.item.rarity}><Sparkles aria-hidden size={15} /> {loot.item.title}</b>
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
        <span className="dungeon-power">战力 <b>{profile.stats.power}</b></span>
        {stats.map(({ label, value, icon: Icon }) => (
          <span key={label}><Icon aria-hidden size={13} /> {label} <b>{value}</b></span>
        ))}
        <span className="dungeon-coins"><Coins aria-hidden size={13} /> 金币 <b>{profile.coins}</b></span>
      </div>
      <p className="dungeon-rule-note">
        公开规则：普通分集掉落学科材料；每 5 集为补给宝箱；每 10 集为精英；末集为课程首领。无随机数，无账号差异。
      </p>
    </section>
  );
}
