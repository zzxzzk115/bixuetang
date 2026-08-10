// 联赛段位:按「本周(北京时间周一起)获得的经验」排名的多邻国式周赛。
// 段位名沿用 LOL 风格(黑铁→王者)。纯函数:段位表、周序号、升降段结算数学——
// 结算(league-server.ts)与前端展示共用同一套规则,保证「看到的晋级区 = 真实晋级判定」。

export interface LeagueTier {
  key: string;
  label: string;
  /** 徽章配色对应的 CSS 变量名(见 globals.css 的 --app-*) */
  colorVar: string;
  /** 段位专属图标键,前端映射到 lucide 图标(见 league-panel 的 TierIcon) */
  icon: string;
}

// 从低到高。新人从青铜起步,黑铁是掉段兜底(见 START_TIER)。
// 图标随段位升高从「盾牌→奖牌→宝石→皇冠」递进,一眼看出高低。
export const LEAGUE_TIERS: LeagueTier[] = [
  { key: "iron", label: "黑铁", colorVar: "--app-gray", icon: "hexagon" },
  { key: "bronze", label: "青铜", colorVar: "--app-brown", icon: "shield" },
  { key: "silver", label: "白银", colorVar: "--app-silver", icon: "award" },
  { key: "gold", label: "黄金", colorVar: "--app-gold", icon: "medal" },
  { key: "platinum", label: "铂金", colorVar: "--app-teal", icon: "gem" },
  { key: "diamond", label: "钻石", colorVar: "--app-blue", icon: "diamond" },
  { key: "master", label: "大师", colorVar: "--app-purple", icon: "star" },
  { key: "king", label: "王者", colorVar: "--app-red", icon: "crown" },
];

export const IRON_INDEX = 0;
export const KING_INDEX = LEAGUE_TIERS.length - 1;
/** 新用户初始段位:青铜 */
export const START_TIER = "bronze";
export const START_TIER_INDEX = 1;

export function tierIndex(key: string): number {
  const i = LEAGUE_TIERS.findIndex((t) => t.key === key);
  return i < 0 ? START_TIER_INDEX : i;
}

export function tierByIndex(i: number): LeagueTier {
  return LEAGUE_TIERS[Math.max(0, Math.min(KING_INDEX, i))];
}

export function tierByKey(key: string): LeagueTier {
  return LEAGUE_TIERS[tierIndex(key)];
}

// ── 周界:以北京时间(UTC+8,无夏令时)周一 00:00 为界 ───────────────────
const CN_OFFSET_MS = 8 * 3600 * 1000;
// 1970-01-05 是周一;它的北京时间 00:00 记为 0 号周起点。
const EPOCH_MONDAY_MS = Date.UTC(1970, 0, 5) - CN_OFFSET_MS;
const WEEK_MS = 7 * 24 * 3600 * 1000;

/** 给定时间戳(ms)落在第几周(自 1970 首个周一起的整数序号) */
export function weekIndex(nowMs: number): number {
  return Math.floor((nowMs - EPOCH_MONDAY_MS) / WEEK_MS);
}

/** 某周序号对应的 [起, 止) 时间戳(ms),用于按周汇总经验 */
export function weekRange(wi: number): { start: number; end: number } {
  const start = EPOCH_MONDAY_MS + wi * WEEK_MS;
  return { start, end: start + WEEK_MS };
}

// ── 升降段规则:升 7 降 5,人少时按 30 人满联赛的比例缩放 ───────────────
export interface ZoneCounts {
  promote: number;
  demote: number;
}

/**
 * 一个段位、某周有 activeN 名活跃者(本周有经验)时的晋级/降级名额。
 * 满联赛(≈30 人)升 7 降 5;小组按比例四舍五入,并保证顶/底段不越界、名额不重叠。
 */
export function zoneCounts(tierIdx: number, activeN: number): ZoneCounts {
  const N = activeN;
  let promote =
    tierIdx >= KING_INDEX ? 0 : Math.max(N >= 2 ? 1 : 0, Math.round((N * 7) / 30));
  let demote =
    tierIdx <= IRON_INDEX ? 0 : N >= 5 ? Math.max(1, Math.round((N * 5) / 30)) : 0;
  // 晋级区与降级区不能重叠(甚至相接):至少留 1 个「原地」名额缓冲
  while (promote + demote >= N && promote + demote > 0) {
    if (demote > 0) demote--;
    else promote--;
  }
  return { promote, demote };
}

export interface LeagueMember {
  userId: number;
  weekXp: number;
}

export type SettleResult = "promote" | "demote" | "stay";

export interface SettleOutcome {
  userId: number;
  fromTier: number;
  toTier: number;
  result: SettleResult;
}

/**
 * 对某段位一周的成员做结算:活跃者(weekXp>0)按经验降序,顶部晋级、底部降级,
 * 中间与不活跃者(0 经验)一律原地。返回每人的段位变动(纯计算,不落库)。
 */
export function settleTier(tierIdx: number, members: LeagueMember[]): SettleOutcome[] {
  const active = members
    .filter((m) => m.weekXp > 0)
    .sort((a, b) => b.weekXp - a.weekXp || a.userId - b.userId);
  const { promote, demote } = zoneCounts(tierIdx, active.length);
  const N = active.length;
  const out: SettleOutcome[] = active.map((m, i) => {
    const result: SettleResult =
      i < promote ? "promote" : i >= N - demote ? "demote" : "stay";
    const toTier =
      tierIdx + (result === "promote" ? 1 : result === "demote" ? -1 : 0);
    return { userId: m.userId, fromTier: tierIdx, toTier, result };
  });
  for (const m of members) {
    if (m.weekXp <= 0)
      out.push({ userId: m.userId, fromTier: tierIdx, toTier: tierIdx, result: "stay" });
  }
  return out;
}
