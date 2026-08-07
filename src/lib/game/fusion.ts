import type { Subject } from "../content/schema";
import {
  itemForEncounter,
  type EncounterType,
  type LootItem,
  type LootRarity,
} from "./rpg";

// 遗物融合(纯函数):三件同稀有度遗物融成一件,有几率升一级稀有度。
// 心理学上这是「垃圾回收 + 抽卡」的合体:低级遗物有了去处(损失厌恶
// 的反面——没有东西是白捡的),融合瞬间又是一次变率强化的开箱时刻。
// 产物学科从三件输入里随机继承——想定向融合就凑同学科的三件。

export const FUSE_COUNT = 3;

/** 升稀有度的概率(传说封顶,融了只重掷学科) */
export const UPGRADE_CHANCE: Record<LootRarity, number> = {
  common: 0.4,
  uncommon: 0.3,
  rare: 0.2,
  legendary: 0,
};

export const NEXT_RARITY: Record<LootRarity, LootRarity | null> = {
  common: "uncommon",
  uncommon: "rare",
  rare: "legendary",
  legendary: null,
};

/** 稀有度 ↔ 掉落场景一一对应(物品 id 由 subject-encounter 构成) */
export const RARITY_ENCOUNTER: Record<LootRarity, EncounterType> = {
  common: "mob",
  uncommon: "cache",
  rare: "elite",
  legendary: "boss",
};

/** 三件输入是否可融合:同稀有度即可(允许三件同款) */
export function fusableError(inputs: LootItem[]): string | null {
  if (inputs.length !== FUSE_COUNT) return "融合需要恰好 3 件遗物";
  const rarity = inputs[0].rarity;
  if (!inputs.every((i) => i.rarity === rarity)) {
    return "三件遗物的稀有度必须相同";
  }
  return null;
}

export interface FusionOutcome {
  item: LootItem;
  upgraded: boolean;
}

/**
 * 计算融合产物。roll ∈ [0,1) 由调用方提供(server action 掷,测试可控)。
 * 第一掷决定是否升级,第二掷选继承哪件输入的学科。
 */
export function fusionResult(
  inputs: LootItem[],
  rollUpgrade: number,
  rollSubject: number,
): FusionOutcome {
  const rarity = inputs[0].rarity;
  const next = NEXT_RARITY[rarity];
  const upgraded = next !== null && rollUpgrade < UPGRADE_CHANCE[rarity];
  const outRarity = upgraded && next ? next : rarity;
  const subjects: Subject[] = inputs.map((i) => i.subject);
  const subject =
    subjects[Math.min(FUSE_COUNT - 1, Math.floor(rollSubject * FUSE_COUNT))];
  return {
    item: itemForEncounter(subject, RARITY_ENCOUNTER[outRarity]),
    upgraded,
  };
}

/** 装备槽扩容:第 4/5/6 个槽的售价(键=购买后的槽数) */
export const SLOT_PRICES: Record<number, number> = {
  4: 300,
  5: 600,
  6: 1000,
};

/** 商店直售的遗物(融合素材;高稀有度只能学出来,商店不卖捷径) */
export const RELIC_SHOP_PRICES: Record<"common" | "uncommon", number> = {
  common: 60,
  uncommon: 150,
};
