// 四向 BFS 寻路。大厅点击寻路（tap-to-move）与「走近门口」都用它——
// 一份实现两处用。网格小（30×20），BFS 足够，不需要 A*。

export interface Vec2 {
  col: number;
  row: number;
}

/** 上下左右四个方向，顺序固定以保证同输入同输出（可单测） */
const DIRS: Vec2[] = [
  { col: 0, row: -1 },
  { col: 1, row: 0 },
  { col: 0, row: 1 },
  { col: -1, row: 0 },
];

function inBounds(grid: boolean[][], col: number, row: number): boolean {
  return row >= 0 && row < grid.length && col >= 0 && col < (grid[row]?.length ?? 0);
}

function passable(grid: boolean[][], col: number, row: number): boolean {
  return inBounds(grid, col, row) && grid[row][col];
}

/** 目标不可走时，就近吸附到 BFS 能达到的最近可走格（点到墙里时用） */
export function nearestWalkable(grid: boolean[][], target: Vec2): Vec2 | null {
  if (passable(grid, target.col, target.row)) return target;
  const seen = new Set<string>();
  const queue: Vec2[] = [target];
  seen.add(`${target.col},${target.row}`);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const d of DIRS) {
      const col = cur.col + d.col;
      const row = cur.row + d.row;
      const key = `${col},${row}`;
      if (seen.has(key) || !inBounds(grid, col, row)) continue;
      seen.add(key);
      if (grid[row][col]) return { col, row };
      queue.push({ col, row });
    }
  }
  return null;
}

/**
 * 从 from 到 to 的最短路（含起点与终点）。
 * to 不可走时先吸附到最近可走格。无路可达返回 null。
 */
export function findPath(grid: boolean[][], from: Vec2, to: Vec2): Vec2[] | null {
  const goal = nearestWalkable(grid, to);
  if (!goal || !passable(grid, from.col, from.row)) return null;
  if (from.col === goal.col && from.row === goal.row) return [from];

  const key = (v: Vec2) => `${v.col},${v.row}`;
  const prev = new Map<string, Vec2 | null>();
  prev.set(key(from), null);
  const queue: Vec2[] = [from];

  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.col === goal.col && cur.row === goal.row) {
      // 回溯
      const path: Vec2[] = [];
      let node: Vec2 | null | undefined = cur;
      while (node) {
        path.push(node);
        node = prev.get(key(node)) ?? null;
      }
      return path.reverse();
    }
    for (const d of DIRS) {
      const next = { col: cur.col + d.col, row: cur.row + d.row };
      if (!passable(grid, next.col, next.row)) continue;
      const k = key(next);
      if (prev.has(k)) continue;
      prev.set(k, cur);
      queue.push(next);
    }
  }
  return null;
}
