// GameBootstrap 的类型定义。单独成文件是因为 bridge.ts / GameShell / 各 DOM 窗口
// （客户端）都要引用这些类型，而 bootstrap.ts 本体 import "server-only"（同步 sqlite），
// 不能进客户端包。类型无运行时，安全共享。

import type { Level, Subject } from "../content/schema";
import type { LootRarity } from "./rpg";
import type { StatBlock } from "./relics";

export interface BootstrapUser {
  id: number;
  name: string;
  avatar: string | null;
}

export interface BootstrapLevel {
  level: number;
  totalXp: number;
  current: number;
  span: number;
  ratio: number;
}

export interface RelicDto {
  id: string;
  title: string;
  subject: Subject;
  rarity: LootRarity;
  quantity: number;
}

export interface EquippedDto {
  slot: number;
  item: RelicDto;
}

export interface RpgDto {
  coins: number;
  relics: RelicDto[];
  equipped: EquippedDto[];
  baseStats: StatBlock;
  bonusStats: StatBlock;
  /** baseStats + bonusStats，游戏侧展示用 */
  stats: StatBlock;
  power: number;
}

export interface CourseSummaryDto {
  id: string;
  title: string;
  code?: string;
  subject: Subject;
  level: Level;
  episodeCount: number;
  watchedCount: number;
  status: "planned" | "learning" | "done" | "dropped" | null;
}

export interface PathSummaryDto {
  id: string;
  title: string;
  subject: Subject;
  courseIds: string[];
}

export interface GameBootstrap {
  user: BootstrapUser;
  level: BootstrapLevel;
  rpg: RpgDto;
  courses: CourseSummaryDto[];
  paths: PathSummaryDto[];
  /** 每学科最高通关层（G3 后填充） */
  trialBest: Partial<Record<Subject, number>>;
}
