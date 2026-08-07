// GameBootstrap 的类型定义。单独成文件是因为 bridge.ts / GameShell / 各 DOM 窗口
// （客户端）都要引用这些类型，而 bootstrap.ts 本体 import "server-only"（同步 sqlite），
// 不能进客户端包。类型无运行时，安全共享。

import type { Level, PathTier, Subject } from "../content/schema";
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
  /** 已解锁装备槽数(默认 3,商店扩容到 6) */
  equipSlots: number;
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
  /** 前置课程 id */
  prerequisites: string[];
  /** 前置是否都打过底了（false = 地图上显示为锁住） */
  unlocked: boolean;
  /** 还差哪几门前置（标题，直接给用户看） */
  missingPrereqs: { id: string; title: string }[];
  /** 「去解锁」该跳到哪门课：沿前置链找到的第一门现在就能学的课 */
  unlockEntry: { id: string; title: string } | null;
}

export interface PathSummaryDto {
  id: string;
  title: string;
  subject: Subject;
  /** 难度分层：初级线的首课一定没有前置 */
  tier: PathTier;
  courseIds: string[];
  /** 整条路线是否可选：一门课都开不了的线，选进去只有一屏的锁 */
  unlocked: boolean;
  /** 锁住时挡在最前面的那几门前置课（标题） */
  missingPrereqs: { id: string; title: string }[];
  /** 「去解锁」入口：从首课的前置链里找到的第一门能学的课 */
  unlockEntry: { id: string; title: string } | null;
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
  /** 当前选中的冒险路线（存库，跨设备一致） */
  routeId: string | null;
  /** 上次学到哪一集（存库） */
  lastWatched: {
    courseId: string;
    episodeN: number;
    positionSec: number;
    ratioPct: number;
  } | null;
}
