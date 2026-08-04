"use server";

import { and, eq, gt } from "drizzle-orm";
import { getCurrentUser } from "../auth/session";
import { db } from "../db/client";
import { rpgEquipment, rpgInventory } from "../db/schema";
import { validateEquip, validateUnequip, type EquipState } from "./equip-rules";
import { getRpgProfile, type RpgProfile } from "./rpg-server";

// 装备/卸下遗物。校验在 equip-rules.ts（纯函数），这里只做取状态与落库。
// 返回完整 RpgProfile，客户端拿它就地刷新（不重查页面）。

export interface EquipResult {
  ok: boolean;
  error?: string;
  profile?: RpgProfile;
}

function loadState(userId: number): EquipState {
  const equipped = new Map(
    db
      .select({ slot: rpgEquipment.slot, itemId: rpgEquipment.itemId })
      .from(rpgEquipment)
      .where(eq(rpgEquipment.userId, userId))
      .all()
      .map((r) => [r.slot, r.itemId] as const),
  );
  const owned = new Set(
    db
      .select({ itemId: rpgInventory.itemId })
      .from(rpgInventory)
      .where(and(eq(rpgInventory.userId, userId), gt(rpgInventory.quantity, 0)))
      .all()
      .map((r) => r.itemId),
  );
  return { equipped, owned };
}

export async function equipRelic(
  slot: number,
  itemId: string,
): Promise<EquipResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  const error = validateEquip(loadState(user.id), slot, itemId);
  if (error) return { ok: false, error };

  db.insert(rpgEquipment)
    .values({ userId: user.id, slot, itemId, equippedAt: Date.now() })
    .onConflictDoUpdate({
      target: [rpgEquipment.userId, rpgEquipment.slot],
      set: { itemId, equippedAt: Date.now() },
    })
    .run();

  return { ok: true, profile: getRpgProfile(user.id) };
}

export async function unequipRelic(slot: number): Promise<EquipResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  const error = validateUnequip(loadState(user.id), slot);
  if (error) return { ok: false, error };

  db.delete(rpgEquipment)
    .where(and(eq(rpgEquipment.userId, user.id), eq(rpgEquipment.slot, slot)))
    .run();

  return { ok: true, profile: getRpgProfile(user.id) };
}
