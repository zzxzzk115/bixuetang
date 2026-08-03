// 公会大厅的俯视地图。用字符画而不是 Tiled tilemap：
// 图很小、进代码库可 review、walkableGrid 直接能喂给 pathfind 单测，
// 省掉 Tiled 编辑器与 JSON 资产管线。
//
// 图例：
//   # 墙（不可走）      . 地板（可走）      空格 = 虚空（不可走，画黑）
//   T 塔门·战争沙盘     A 试炼场门          G 卷宗·术语表
//   L 工坊·实验室       B 库房·背包         Q 布告栏·每日委托
//   @ 角色出生点（也是可走地板）
//
// 每个字母格都是一个 POI（据点），坐标由 parseHall 解析出来。

export const TILE = 16;

/** 一格代表 16×16 像素。地图 30 宽 × 20 高。 */
export const HALL_MAP: string[] = [
  "##############################",
  "#............................#",
  "#..######............######..#",
  "#..#....#....####....#....#..#",
  "#..#..T.#....#..#....#.A..#..#",
  "#..#....#....#..#....#....#..#",
  "#..##..##....####....##..##..#",
  "#............................#",
  "#............####............#",
  "#....G.......#..#.......L.....#",
  "#............#..#.............#",
  "#............####............#",
  "#............................#",
  "#..##..##....####....##..##..#",
  "#..#....#....#..#....#....#..#",
  "#..#.B..#....#.@#....#.Q..#..#",
  "#..#....#....#..#....#....#..#",
  "#..######............######..#",
  "#............................#",
  "##############################",
];

export type PoiKind = "tower" | "trial" | "glossary" | "lab" | "inventory" | "quests";

export interface Poi {
  kind: PoiKind;
  /** 格坐标（列、行） */
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

/** 出生点格坐标 */
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
        pois.push({ ...poi, col, row, radius: TILE * 1.5 });
      }
    }
  }

  return { cols, rows, walkable, pois, spawn };
}

/** 供寻路用的可走网格（行优先，grid[row][col]） */
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
