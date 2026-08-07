import { EQUIP_SLOTS } from "./relics";

// 装备操作的校验（纯函数，action 与测试共用）。
// 规则：槽位 0..槽数-1（默认 3,商店可扩容）；必须持有该遗物；
// 同一遗物只能占一个槽（换槽视为先卸下再装上，由调用方组合）。

export interface EquipState {
  /** slot → itemId */
  equipped: Map<number, string>;
  /** 持有的遗物 id 集合（quantity > 0） */
  owned: Set<string>;
  /** 该用户解锁的槽数(默认 EQUIP_SLOTS) */
  slots?: number;
}

export function validateEquip(
  state: EquipState,
  slot: number,
  itemId: string,
): string | null {
  const slots = state.slots ?? EQUIP_SLOTS;
  if (!Number.isInteger(slot) || slot < 0 || slot >= slots) {
    return "槽位不存在(商店可扩容)";
  }
  if (!state.owned.has(itemId)) return "没有这件遗物";
  for (const [s, id] of state.equipped) {
    if (id === itemId && s !== slot) return "这件遗物已装在别的槽里";
  }
  return null;
}

export function validateUnequip(state: EquipState, slot: number): string | null {
  const slots = state.slots ?? EQUIP_SLOTS;
  if (!Number.isInteger(slot) || slot < 0 || slot >= slots) {
    return "槽位不存在";
  }
  if (!state.equipped.has(slot)) return "这个槽是空的";
  return null;
}
