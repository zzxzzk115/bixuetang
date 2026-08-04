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
  /** 各集的 n 值（地图拆节点用，保持内容顺序） */
  episodeNs: number[];
  /** 已看集的 n 值 */
  watched: number[];
  /** 是否有测验题库（决定地图上是否有测验节点） */
  hasQuiz: boolean;
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
  /** 连续学习天数（顶栏火焰） */
  streak: number;
  /** 每学科最高通关层（G3 后填充） */
  trialBest: Partial<Record<Subject, number>>;
  /** 已通过的测验节点 ref（`courseId:index`） */
  quizDone: string[];
  /** 已开过的宝箱 ref（`courseId:index`） */
  chestDone: string[];
  /** 今天的试炼奖励是否已领 */
  trialClaimedToday: boolean;
  /** 生效中的经验加成（药水），无则 null */
  boost: { multiplierPct: number; episodesLeft: number } | null;
}
