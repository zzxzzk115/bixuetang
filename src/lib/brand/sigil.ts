// 站点徽记：一座学堂——屋顶下面一个对勾。
//
// 「必学堂」的两层意思都在里面：「堂」是那个屋顶，「必学」是那个勾
// （站内的核心动作本来就是勾掉一集）。
//
// 矢量而非像素网格：早先的盾牌徽记是 16×16 像素画，为了跟地下城素材
// 统一视觉；那套玩法退役后这个理由就不成立了，而 favicon 是 SVG，
// 本来也不该被 16px 的分辨率限制住。
//
// 品牌色写死不跟随主题——logo 在亮/暗两套配色下应当保持同一个样子，
// 而且 favicon 本来就拿不到 CSS 变量。

/** 画布尺寸，所有路径都按这个坐标系写 */
export const SIGIL_SIZE = 64;

export const SIGIL_COLORS = {
  /** 堂身与屋顶 */
  green: "#58cc02",
  /** 深一档，OG 图的描边等处用 */
  greenDark: "#46a802",
  /** 勾 */
  ink: "#ffffff",
  /** OG 图的底色与正文色 */
  bg: "#0f1116",
  text: "#f2ecdc",
} as const;

/** 学堂轮廓：屋脊是圆角的，四角也是——尖角在小尺寸下会显得扎眼 */
export const SIGIL_HOUSE_PATH =
  "M28.5 4.6 a5 5 0 0 1 7 0 L59 22.5 v27.9 a8 8 0 0 1 -8 8 H13 a8 8 0 0 1 -8 -8 V22.5 Z";

/** 勾。用 stroke 画，端点和转角都是圆的 */
export const SIGIL_CHECK_PATH = "M20 39.5 l8.5 8.5 L46 30.5";
export const SIGIL_CHECK_WIDTH = 8;

/**
 * 徽记的 SVG 内容（不含最外层 svg 标签），给 React 组件与静态文件共用。
 */
export function sigilBody(): string {
  return (
    `<path d="${SIGIL_HOUSE_PATH}" fill="${SIGIL_COLORS.green}"/>` +
    `<path d="${SIGIL_CHECK_PATH}" fill="none" stroke="${SIGIL_COLORS.ink}" ` +
    `stroke-width="${SIGIL_CHECK_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

/** 独立 SVG 文件用（favicon / OG 图），不依赖 React */
export function sigilSvg(size = SIGIL_SIZE): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${SIGIL_SIZE} ${SIGIL_SIZE}">` +
    sigilBody() +
    `</svg>`
  );
}
