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
}

export interface EpisodeLoot {
  encounterType: EncounterType;
  coins: number;
  item: LootItem;
  ruleVersion: number;
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

export function itemForEncounter(subject: Subject, encounterType: EncounterType): LootItem {
  const item = SUBJECT_ITEMS[subject][encounterType];
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
  };
}

export function getLootItem(itemId: string): LootItem | undefined {
  for (const subject of Object.keys(SUBJECT_ITEMS) as Subject[]) {
    for (const encounter of Object.keys(SUBJECT_ITEMS[subject]) as EncounterType[]) {
      const item = itemForEncounter(subject, encounter);
      if (item.id === itemId) return item;
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
