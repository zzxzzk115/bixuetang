"use server";

import { getCurrentUser } from "../auth/session";
import { db } from "../db/client";
import { userState } from "../db/schema";

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
