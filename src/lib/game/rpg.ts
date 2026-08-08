import type { Level, Subject } from "../content/schema";

export const RPG_RULE_VERSION = 1;

export type EncounterType = "mob" | "cache" | "elite" | "boss";
export type LootRarity = "common" | "uncommon" | "rare" | "legendary";

export interface LootItem {
  id: string;
  title: string;
  description: string;
  subject: Subject;
  rarity: LootRarity;
  /** 诅咒遗物:主属性翻倍加成,但另一属性负增益(高风险高回报) */
  cursed?: boolean;
}

export interface EpisodeLoot {
  encounterType: EncounterType;
  coins: number;
  item: LootItem;
  ruleVersion: number;
  /** 幸运彩蛋金币(0=没中)。变率强化:偶尔的意外之喜比稳定发放更让人上头 */
  luckyCoins: number;
}

const SUBJECT_ITEMS: Record<Subject, Record<EncounterType, Omit<LootItem, "id" | "subject">>> = {
  cs: {
    mob: { title: "逻辑碎片", description: "由一次程序推演凝结的计算材料。", rarity: "common" },
    cache: { title: "算法手稿", description: "记录关键步骤的结构化手稿。", rarity: "uncommon" },
    elite: { title: "系统徽记", description: "完成高强度系统遭遇的证明。", rarity: "rare" },
    boss: { title: "计算核心", description: "完整攻克一门计算机课程的核心遗物。", rarity: "legendary" },
  },
  math: {
    mob: { title: "演算粉笔", description: "一次完整推导留下的演算材料。", rarity: "common" },
    cache: { title: "定理札记", description: "收录定义、命题与证明线索的札记。", rarity: "uncommon" },
    elite: { title: "证明印章", description: "通过高难度证明遭遇的凭证。", rarity: "rare" },
    boss: { title: "公理棱镜", description: "完整攻克一门数学课程的核心遗物。", rarity: "legendary" },
  },
  physics: {
    mob: { title: "观测晶屑", description: "一次物理观察留下的实验材料。", rarity: "common" },
    cache: { title: "场论图谱", description: "整理变量、场与相互作用的图谱。", rarity: "uncommon" },
    elite: { title: "守恒徽章", description: "通过高难度物理遭遇的凭证。", rarity: "rare" },
    boss: { title: "时空晶核", description: "完整攻克一门物理课程的核心遗物。", rarity: "legendary" },
  },
  ai: {
    mob: { title: "张量碎片", description: "一次模型学习留下的计算材料。", rarity: "common" },
    cache: { title: "训练日志", description: "记录目标函数与优化轨迹的日志。", rarity: "uncommon" },
    elite: { title: "推理徽记", description: "通过高难度智能系统遭遇的凭证。", rarity: "rare" },
    boss: { title: "智能核心", description: "完整攻克一门人工智能课程的核心遗物。", rarity: "legendary" },
  },
  en: {
    mob: { title: "音标碎片", description: "一次跟读留下的发音材料。", rarity: "common" },
    cache: { title: "语料手册", description: "收录地道表达与连读弱读的手册。", rarity: "uncommon" },
    elite: { title: "口语勋章", description: "攻克高难度原速跟读的凭证。", rarity: "rare" },
    boss: { title: "母语者之证", description: "把一条跟读线练到张口就来的核心遗物。", rarity: "legendary" },
  },
  history: {
    mob: { title: "断简残编", description: "一段史事留下的零散记载。", rarity: "common" },
    cache: { title: "编年卷轴", description: "串起年代与事件的编年手卷。", rarity: "uncommon" },
    elite: { title: "青史印鉴", description: "读通一段兴衰治乱的凭证。", rarity: "rare" },
    boss: { title: "通鉴之钥", description: "贯通一条历史线、以史为鉴的核心遗物。", rarity: "legendary" },
  },
};

const LEVEL_COINS: Record<Level, number> = {
  basic: 12,
  intermediate: 18,
  advanced: 26,
};

const ENCOUNTER_BONUS: Record<EncounterType, number> = {
  mob: 0,
  cache: 10,
  elite: 24,
  boss: 60,
};

/**
 * Encounter positions are public and fixed for every player.
 * The final episode is the boss; every 10th is elite; every 5th is a cache.
 */
export function encounterForEpisode(episodeN: number, totalEpisodes: number): EncounterType {
  if (episodeN === totalEpisodes) return "boss";
  if (episodeN % 10 === 0) return "elite";
  if (episodeN % 5 === 0) return "cache";
  return "mob";
}

export function itemForEncounter(
  subject: Subject,
  encounterType: EncounterType,
  cursed = false,
): LootItem {
  const item = SUBJECT_ITEMS[subject][encounterType];
  if (cursed) {
    return {
      id: `${subject}-${encounterType}-cursed`,
      subject,
      rarity: item.rarity,
      title: `诅咒·${item.title}`,
      description: `${item.description} 被诅咒缠绕:力量翻涌,却在别处留下裂痕。`,
      cursed: true,
    };
  }
  return {
    id: `${subject}-${encounterType}`,
    subject,
    ...item,
  };
}

/**
 * Rewards depend only on published course data and episode position.
 * There is no random roll and no per-user variance.
 */
/**
 * 幸运彩蛋:约 15% 的集会掉一笔 10–30 的额外金币。
 * 变率强化(variable-ratio reinforcement)是最抗消退的强化程式——
 * 「这集会不会中?」比每集固定发放更能维持行为。
 * 用 (userId, courseId, episodeN) 播种的确定性哈希:同一键永远同结果,
 * 取消重勾也刷不出第二次,幂等性与 XP 流水同级。
 */
export function luckyBonusCoins(
  userId: number,
  courseId: string,
  episodeN: number,
): number {
  let h = userId * 2654435761;
  for (let i = 0; i < courseId.length; i++) {
    h = Math.imul(h ^ courseId.charCodeAt(i), 0x01000193);
  }
  h = Math.imul(h ^ episodeN, 0x01000193) >>> 0;
  const roll = (h % 1000) / 1000;
  if (roll >= 0.15) return 0;
  return 10 + (Math.floor(h / 1000) % 21); // 10..30
}

/** 诅咒掉落概率(约 8%) */
export const CURSE_CHANCE = 0.08;

/**
 * 这一集掉落的遗物是否被诅咒:用 (userId,courseId,episodeN) 播种的
 * 确定性哈希,同键永远同结果,重勾刷不出第二份——与幸运彩蛋同一套幂等。
 * 用不同的乘数种子,和幸运判定互相独立。
 */
export function isCursedDrop(
  userId: number,
  courseId: string,
  episodeN: number,
): boolean {
  let h = (userId + 1) * 0x9e3779b1;
  for (let i = 0; i < courseId.length; i++) {
    h = Math.imul(h ^ courseId.charCodeAt(i), 0x85ebca6b);
  }
  h = Math.imul(h ^ (episodeN + 7), 0x85ebca6b) >>> 0;
  return (h % 1000) / 1000 < CURSE_CHANCE;
}

export function lootForEpisode(
  subject: Subject,
  level: Level,
  episodeN: number,
  totalEpisodes: number,
): EpisodeLoot {
  const encounterType = encounterForEpisode(episodeN, totalEpisodes);
  return {
    encounterType,
    coins: LEVEL_COINS[level] + ENCOUNTER_BONUS[encounterType],
    item: itemForEncounter(subject, encounterType),
    ruleVersion: RPG_RULE_VERSION,
    luckyCoins: 0,
  };
}

export function getLootItem(itemId: string): LootItem | undefined {
  const cursed = itemId.endsWith("-cursed");
  const baseId = cursed ? itemId.slice(0, -"-cursed".length) : itemId;
  for (const subject of Object.keys(SUBJECT_ITEMS) as Subject[]) {
    for (const encounter of Object.keys(SUBJECT_ITEMS[subject]) as EncounterType[]) {
      if (`${subject}-${encounter}` === baseId) {
        return itemForEncounter(subject, encounter, cursed);
      }
    }
  }
  return undefined;
}

export const ENCOUNTER_LABEL: Record<EncounterType, string> = {
  mob: "守卫",
  cache: "补给宝箱",
  elite: "精英",
  boss: "课程首领",
};
