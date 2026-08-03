// 公会大厅的据点清单。大厅本身是「角色立绘 + 旋转深渊 + 据点悬浮环绕」的主界面
// （见 src/game/scenes/hall.ts），不再是可行走地图，所以这里只保留据点定义。

export type PoiKind = "tower" | "trial" | "glossary" | "lab" | "inventory" | "quests";

export interface Poi {
  kind: PoiKind;
  label: string;
}

// 顺序即环绕顺序（从正上方顺时针），场景据此均匀铺开
export const HALL_MAP: Poi[] = [
  { kind: "tower", label: "战争沙盘" },
  { kind: "trial", label: "试炼场" },
  { kind: "lab", label: "实验工坊" },
  { kind: "quests", label: "布告栏" },
  { kind: "inventory", label: "库房·背包" },
  { kind: "glossary", label: "卷宗·术语" },
];

export function parseHall(map: Poi[] = HALL_MAP): { pois: Poi[] } {
  return { pois: map };
}
