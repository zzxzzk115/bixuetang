"use server";

import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "../auth/session";
import { db } from "../db/client";
import { mistakes } from "../db/schema";
import {
  isMistakeAnswerCorrect,
  saveMistakes,
  type MistakeItem,
} from "./mistakes";

// 错题本写侧:答题结束落错题(去重累计)、重刷答对后清除(服务端核对答案再删)。

export async function recordMistakes(
  items: MistakeItem[],
): Promise<{ ok: boolean; saved?: number }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  if (!Array.isArray(items) || items.length === 0) return { ok: true, saved: 0 };
  const saved = saveMistakes(user.id, items);
  return { ok: true, saved };
}

/** 重刷答对 → 清除该错题。服务端按 seed 复现核对,答错/伪造不清。 */
export async function resolveMistake(
  mistakeId: number,
  seed: number,
  chosen: number,
): Promise<{ ok: boolean; cleared?: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  if (!Number.isInteger(mistakeId)) return { ok: false };
  if (!isMistakeAnswerCorrect(user.id, mistakeId, Number(seed), Number(chosen))) {
    return { ok: true, cleared: false };
  }
  db.delete(mistakes)
    .where(and(eq(mistakes.id, mistakeId), eq(mistakes.userId, user.id)))
    .run();
  return { ok: true, cleared: true };
}
