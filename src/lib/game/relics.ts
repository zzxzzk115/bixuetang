import type { Subject } from "../content/schema";
import type { LootItem, LootRarity } from "./rpg";

// 遗物加成。此前遗物只是个计数，掉了也没用；这里给它实际作用：
// 装备后加属性，属性再决定试炼场里打不打得过。
//
// 学科决定加哪一项，稀有度决定加多少——都不是随机数，
// 玩家看得懂「我该去学什么才能变强」。

export const EQUIP_SLOTS = 3;

/** 每个学科主加一项属性，对应它锻炼的能力 */
export const SUBJECT_STAT: Record<Subject, StatKey> = {
  cs: "precision", // 工程实现讲究一次做对
  math: "insight", // 数学是看穿结构
  physics: "resolve", // 物理靠啃硬骨头
  ai: "focus", // 训练模型是长跑
};

export type StatKey = "insight" | "focus" | "precision" | "resolve";

export const STAT_LABEL: Record<StatKey, string> = {
  insight: "洞察",
  focus: "专注",
  precision: "精准",
  resolve: "意志",
};

/** 提升每项属性该做什么——打不过时要能告诉玩家下一步 */
export const STAT_ADVICE: Record<StatKey, string> = {
  insight: "点亮更多技能节点、提升等级",
  focus: "累计专注时长（在课程页开启专注计时）",
  precision: "多看几集，攒够遭遇次数",
  resolve: "通过更多检查点测验",
};

const RARITY_POWER: Record<LootRarity, number> = {
  common: 1,
  uncommon: 2,
  rare: 4,
  legendary: 8,
};

export type StatBlock = Record<StatKey, number>;

export const ZERO_STATS: StatBlock = {
  insight: 0,
  focus: 0,
  precision: 0,
  resolve: 0,
};

/**
 * 同种遗物堆叠的收益递减：1 个 ×1，2-3 个 ×2，4-7 个 ×3，8-15 个 ×4……
 * 用 log2 而不是线性，否则刷同一门课的低级怪就能无限堆属性，
 * 那样最优解变成「重复刷最简单的课」，与「学得广才变强」相悖。
 */
export function stackMultiplier(quantity: number): number {
  if (quantity <= 0) return 0;
  return 1 + Math.floor(Math.log2(quantity));
}

/** 单件遗物在装备后提供的属性（只看学科与稀有度，客户端 DTO 也能直接传） */
export function relicBonus(
  item: Pick<LootItem, "subject" | "rarity">,
  quantity: number,
): StatBlock {
  const stat = SUBJECT_STAT[item.subject];
  const value = RARITY_POWER[item.rarity] * stackMultiplier(quantity);
  return { ...ZERO_STATS, [stat]: value };
}

export function sumStats(blocks: StatBlock[]): StatBlock {
  return blocks.reduce<StatBlock>(
    (acc, b) => ({
      insight: acc.insight + b.insight,
      focus: acc.focus + b.focus,
      precision: acc.precision + b.precision,
      resolve: acc.resolve + b.resolve,
    }),
    { ...ZERO_STATS },
  );
}

export interface EquippedRelic {
  item: LootItem;
  quantity: number;
}

/** 装备栏带来的总加成。超出格子数的部分不计，避免前端漏校验时被绕过 */
export function equipmentBonus(equipped: EquippedRelic[]): StatBlock {
  return sumStats(
    equipped.slice(0, EQUIP_SLOTS).map((e) => relicBonus(e.item, e.quantity)),
  );
}
