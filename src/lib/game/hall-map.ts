// 公会大厅的俯视地图。紧凑单屏设计——整间大厅一眼看全，不用走很久才发现据点。
// 出生点在正中央，6 个据点对称环绕四周，走几步即可抵达任意一个。
//
// 图例：
//   # 墙   . 地板   @ 出生点（可走）
//   T 战争沙盘   A 试炼场   G 卷宗·术语   L 实验工坊   B 库房·背包   Q 布告栏

export const TILE = 16;

export const HALL_MAP: string[] = [
  "###############",
  "#.............#",
  "#...T.....A...#",
  "#.............#",
  "#.............#",
  "#.G....@....L.#",
  "#.............#",
  "#.............#",
  "#..B.......Q..#",
  "#.............#",
  "###############",
];

export type PoiKind = "tower" | "trial" | "glossary" | "lab" | "inventory" | "quests";

export interface Poi {
  kind: PoiKind;
  col: number;
  row: number;
  label: string;
  /** 走近该格多少像素内触发进入提示 */
  radius: number;
}

const POI_CHARS: Record<string, { kind: PoiKind; label: string }> = {
  T: { kind: "tower", label: "战争沙盘" },
  A: { kind: "trial", label: "试炼场" },
  G: { kind: "glossary", label: "卷宗·术语" },
  L: { kind: "lab", label: "实验工坊" },
  B: { kind: "inventory", label: "库房·背包" },
  Q: { kind: "quests", label: "布告栏" },
};

export interface HallLayout {
  cols: number;
  rows: number;
  /** true = 可走 */
  walkable: boolean[][];
  pois: Poi[];
  spawn: { col: number; row: number };
}

const WALKABLE_CHARS = new Set([".", "@", ...Object.keys(POI_CHARS)]);

export function parseHall(map: string[] = HALL_MAP): HallLayout {
  const rows = map.length;
  const cols = Math.max(...map.map((r) => r.length));
  const walkable: boolean[][] = [];
  const pois: Poi[] = [];
  let spawn = { col: 1, row: 1 };

  for (let row = 0; row < rows; row++) {
    walkable[row] = [];
    for (let col = 0; col < cols; col++) {
      const ch = map[row][col] ?? " ";
      walkable[row][col] = WALKABLE_CHARS.has(ch);
      if (ch === "@") spawn = { col, row };
      const poi = POI_CHARS[ch];
      if (poi) {
        pois.push({ ...poi, col, row, radius: TILE * 1.4 });
      }
    }
  }

  return { cols, rows, walkable, pois, spawn };
}

export function walkableGrid(map: string[] = HALL_MAP): boolean[][] {
  return parseHall(map).walkable;
}

/** 格中心的像素坐标 */
export function cellCenter(col: number, row: number): { x: number; y: number } {
  return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
}

/** 像素坐标落在哪一格 */
export function pixelToCell(x: number, y: number): { col: number; row: number } {
  return { col: Math.floor(x / TILE), row: Math.floor(y / TILE) };
}

/** 图集里各类 tile 的索引（tiles.png 10 列，idx = row*10+col），由参考地图反推 */
export const TILE_IDX = {
  floor: 38,
  wall: 12,
  wallTop: 2,
} as const;
