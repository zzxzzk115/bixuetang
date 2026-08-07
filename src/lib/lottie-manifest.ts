// Lottie 动画时刻清单。
//
// 素材放 public/lottie/,按时刻名命名(如 level-up.lottie 或 level-up.json,
// 两种扩展名都认,.lottie 优先)。文件不存在时对应时刻自动退回 CSS 动效,
// 站点不会因为缺素材而报错——放进文件即生效,无需改代码。
//
// 推荐去 lottiefiles.com 按下述搜索词挑选(免费素材需登录下载):
//   boss-clear   → "trophy winner" / "confetti burst"
//   level-up     → "level up" / "sparkle success"
//   quest-done   → "check success celebration"
//   chest-open   → "treasure chest open"
//   streak       → "fire flame streak"
//   term-unlock  → "book magic sparkle"

export const LOTTIE_MOMENTS = [
  "boss-clear",
  "level-up",
  "quest-done",
  "chest-open",
  "streak",
  "term-unlock",
] as const;

export type LottieMomentName = (typeof LOTTIE_MOMENTS)[number];

/** 每个时刻按顺序探测的候选文件 */
export function lottieCandidates(moment: LottieMomentName): string[] {
  return [`/lottie/${moment}.lottie`, `/lottie/${moment}.json`];
}
