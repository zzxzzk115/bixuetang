// 公会徽记：盾牌里嵌一本摊开的书。
//
// 用 16×16 像素网格描述，跟 public/assets/pixel-dungeon 的 0x72 素材是同一套
// 视觉语言（16px 网格、硬边、无抗锯齿）。网格是唯一真源：
// 导航栏徽记与 src/app/icon.svg 都由它生成，改这里跑 `npm run brand:gen` 即可同步。
//
// 品牌色写死不跟随主题——logo 在亮/暗两套配色下应当保持同一个样子，
// 而且 favicon 本来就拿不到 CSS 变量。

export const SIGIL_SIZE = 16;

/** `#` 金色描边 · `-` 盾面 · `*` 书壳 · `~` 书页 · `.` 透明 */
export const SIGIL_GRID = [
  "................",
  "..############..",
  ".##----------##.",
  ".#------------#.",
  ".#-**********-#.",
  ".#-*~~~**~~~*-#.",
  ".#-*~~~**~~~*-#.",
  ".#-*~~~**~~~*-#.",
  ".#-**********-#.",
  ".#------------#.",
  ".##----------##.",
  "..#----------#..",
  "...#--------#...",
  "....#------#....",
  ".....#----#.....",
  "......####......",
] as const;

export const SIGIL_COLORS = {
  gold: "#d9a441",
  shield: "#1b1f2a",
  page: "#efe6d0",
} as const;

const FILL: Record<string, string> = {
  "#": SIGIL_COLORS.gold,
  "-": SIGIL_COLORS.shield,
  "*": SIGIL_COLORS.gold,
  "~": SIGIL_COLORS.page,
};

export interface SigilRect {
  x: number;
  y: number;
  w: number;
  fill: string;
}

/**
 * 把网格压成横向连续色块。
 * 逐格出 rect 要 200 多个节点，而徽记在每个页面的顶栏都要渲染一次；
 * 合并同色横向游程后只剩几十个。
 */
export function sigilRects(): SigilRect[] {
  const out: SigilRect[] = [];
  SIGIL_GRID.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let w = 1;
      while (x + w < row.length && row[x + w] === ch) w++;
      const fill = FILL[ch];
      if (fill) out.push({ x, y, w, fill });
      x += w;
    }
  });
  return out;
}

/** 独立 SVG 文件用（favicon / OG 图），不依赖 React */
export function sigilSvg(size = SIGIL_SIZE): string {
  const rects = sigilRects()
    .map(
      (r) =>
        `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="1" fill="${r.fill}"/>`,
    )
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${SIGIL_SIZE} ${SIGIL_SIZE}" shape-rendering="crispEdges">` +
    rects +
    `</svg>`
  );
}
