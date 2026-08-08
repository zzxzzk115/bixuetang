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
  /** 诅咒遗物:主属性翻倍但另一项负增益 */
  cursed?: boolean;
}

export interface EquippedDto {
  slot: number;
  item: RelicDto;
}

export interface RpgDto {
  coins: number;
  /** 已解锁装备槽数(默认 3,商店扩容到 6) */
  equipSlots: number;
  /** 护盾血(蓝心)持有数 */
  shieldHearts: number;
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
  /** course=课程线；shadow=影子跟读线(courseIds 里是跟读单元 id) */
  mode: "course" | "shadow";
  courseIds: string[];
  /** 整条路线是否可选：一门课都开不了的线，选进去只有一屏的锁 */
  unlocked: boolean;
  /** 锁住时挡在最前面的那几门前置课（标题） */
  missingPrereqs: { id: string; title: string }[];
  /** 「去解锁」入口：从首课的前置链里找到的第一门能学的课 */
  unlockEntry: { id: string; title: string } | null;
}

export interface ShadowUnitDto {
  id: string;
  title: string;
  /** 难度档 l1..l4 */
  level: string;
  /** 句子总数(练习页/节点段划分用) */
  sentenceCount: number;
  /** 各跟读段是否练完,下标=段序号 */
  segDone: boolean[];
  /** 单元宝箱是否已开 */
  chestDone: boolean;
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
  /** 影子跟读单元(供跟读线的地图节点渲染) */
  shadowUnits: ShadowUnitDto[];
  /** 今天的试炼奖励是否已领 */
  trialClaimedToday: boolean;
  /** 生效中的按次经验加成（药水），无则 null */
  boost: { multiplierPct: number; episodesLeft: number } | null;
  /** 生效中的时长型经验加成（全局按时长），无则 null */
  timedBoost: { multiplierPct: number; secondsLeft: number } | null;
  /** 当前选中的冒险路线（存库，跨设备一致） */
  routeId: string | null;
  /** 上次学到哪一集（存库） */
  lastWatched: {
    courseId: string;
    episodeN: number;
    positionSec: number;
    ratioPct: number;
  } | null;
  /** 是否已完成/跳过首次运行引导（false + 零进度 = 新用户弹欢迎） */
  onboarded: boolean;
  /** 选定的职业目标（成为 X 路线 id），未选则 null */
  goalRoadmap: string | null;
  /** 是否已就「成为 X 目标」弹过提示（老用户补弹一次的门控） */
  goalPrompted: boolean;
}
