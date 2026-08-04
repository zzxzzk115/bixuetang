"use server";

import { getCurrentUser } from "../auth/session";
import { db } from "../db/client";
import { ccOffsets, userState } from "../db/schema";

// 学习状态写入（跨设备该一致的东西走这里）

export async function saveRouteChoice(routeId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const now = Date.now();
  db.insert(userState)
    .values({ userId: user.id, routeId, updatedAt: now })
    .onConflictDoUpdate({
      target: userState.userId,
      set: { routeId, updatedAt: now },
    })
    .run();
}

/**
 * 保存播放器偏好（音量/倍速/弹幕/字幕/清晰度）。
 * 这些也跟人走：换台电脑不该重新调一遍。本地只留一份缓存加速首帧。
 */
export async function savePlayerPrefs(json: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  if (json.length > 4000) return; // 防止塞垃圾
  const now = Date.now();
  db.insert(userState)
    .values({ userId: user.id, playerPrefs: json, updatedAt: now })
    .onConflictDoUpdate({
      target: userState.userId,
      set: { playerPrefs: json, updatedAt: now },
    })
    .run();
}

/**
 * 保存某个视频的字幕时间轴偏移。
 * 按 cid 存：偏移是这份字幕文件本身的毛病，跟视频走而不是跟设备走。
 */
export async function saveCcOffset(
  cid: number,
  offsetMs: number,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  if (!Number.isInteger(cid) || cid <= 0) return;
  // 超过 ±30 秒的偏移基本是误操作，不是校准
  const clamped = Math.max(-30_000, Math.min(30_000, Math.round(offsetMs)));
  const now = Date.now();
  db.insert(ccOffsets)
    .values({ userId: user.id, cid, offsetMs: clamped, updatedAt: now })
    .onConflictDoUpdate({
      target: [ccOffsets.userId, ccOffsets.cid],
      set: { offsetMs: clamped, updatedAt: now },
    })
    .run();
}
