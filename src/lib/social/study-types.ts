// 自习室的共享类型(纯类型,server 查询与 client 组件都引)。

export interface RoomSummary {
  id: number;
  name: string;
  emoji: string | null;
  /** 此刻在场人数(存活窗口内有心跳的) */
  count: number;
}

export interface RoomMember {
  userId: number;
  name: string;
  avatar: string | null;
  /** 本次已自习分钟数(now - enteredAt) */
  minutes: number;
}

export interface RoomView {
  id: number;
  name: string;
  emoji: string | null;
  members: RoomMember[];
}

/** 在场存活窗口:超过这个时间没心跳即视为离开 */
export const PRESENCE_ALIVE_MS = 90_000;
