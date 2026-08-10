"use server";

import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "../auth/session";
import { db } from "../db/client";
import { integrations } from "../db/schema";
import { gatherExport } from "./gather";
import {
  pushToNotion,
  pushToReadwise,
  validateNotion,
  validateReadwise,
} from "./connections";

// Readwise / Notion 连接的连/断/同步。令牌只存不回传前端;状态查询只暴露「是否已连」。

export type Provider = "readwise" | "notion";

export interface IntegrationStatus {
  provider: Provider;
  connected: boolean;
  lastSyncedAt: number | null;
}

export async function getIntegrationStatus(): Promise<IntegrationStatus[]> {
  const user = await getCurrentUser();
  const base: IntegrationStatus[] = [
    { provider: "readwise", connected: false, lastSyncedAt: null },
    { provider: "notion", connected: false, lastSyncedAt: null },
  ];
  if (!user) return base;
  const rows = db
    .select({ provider: integrations.provider, lastSyncedAt: integrations.lastSyncedAt })
    .from(integrations)
    .where(eq(integrations.userId, user.id))
    .all();
  return base.map((b) => {
    const row = rows.find((r) => r.provider === b.provider);
    return row ? { ...b, connected: true, lastSyncedAt: row.lastSyncedAt } : b;
  });
}

async function upsert(
  userId: number,
  provider: Provider,
  token: string,
  config: string | null,
) {
  const now = Date.now();
  db.insert(integrations)
    .values({ userId, provider, token, config, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [integrations.userId, integrations.provider],
      set: { token, config, updatedAt: now },
    })
    .run();
}

export async function connectReadwise(
  tokenRaw: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "未登录" };
  const token = tokenRaw.trim();
  if (!token) return { ok: false, error: "请填令牌" };
  if (!(await validateReadwise(token)))
    return { ok: false, error: "令牌无效(在 readwise.io/access_token 获取)" };
  await upsert(user.id, "readwise", token, null);
  return { ok: true };
}

export async function connectNotion(
  tokenRaw: string,
  databaseIdRaw: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "未登录" };
  const token = tokenRaw.trim();
  const databaseId = databaseIdRaw.trim().replace(/-/g, "");
  if (!token || !databaseId) return { ok: false, error: "请填令牌与数据库 ID" };
  if (!(await validateNotion(token)))
    return { ok: false, error: "Notion 令牌无效" };
  await upsert(user.id, "notion", token, JSON.stringify({ databaseId }));
  return { ok: true };
}

export async function disconnectIntegration(
  provider: Provider,
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  db.delete(integrations)
    .where(and(eq(integrations.userId, user.id), eq(integrations.provider, provider)))
    .run();
  return { ok: true };
}

export async function syncIntegration(
  provider: Provider,
): Promise<{ ok: boolean; count?: number; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "未登录" };
  const row = db
    .select()
    .from(integrations)
    .where(and(eq(integrations.userId, user.id), eq(integrations.provider, provider)))
    .get();
  if (!row) return { ok: false, error: "尚未连接" };

  const bundle = gatherExport(user.id);
  if (bundle.notes.length === 0) return { ok: false, error: "还没有笔记可同步" };

  const res =
    provider === "readwise"
      ? await pushToReadwise(row.token, bundle)
      : await pushToNotion(
          row.token,
          (JSON.parse(row.config ?? "{}").databaseId as string) ?? "",
          bundle,
        );
  if (!res.ok) return { ok: false, error: res.error };
  db.update(integrations)
    .set({ lastSyncedAt: Date.now() })
    .where(and(eq(integrations.userId, user.id), eq(integrations.provider, provider)))
    .run();
  return { ok: true, count: res.count };
}
