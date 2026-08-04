// 排位分：标准 ELO（K=32）+ 段位换算。纯函数，结算与展示共用。

export const INITIAL_RATING = 1000;
const K = 32;

/** a 对 b 的期望胜率 */
export function expectedScore(ra: number, rb: number): number {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}

/** result：1=胜 0.5=平 0=负。返回 a 的新分（b 的对称调用即可） */
export function applyElo(ra: number, rb: number, result: 0 | 0.5 | 1): number {
  return Math.round(ra + K * (result - expectedScore(ra, rb)));
}

export interface RankTier {
  key: string;
  label: string;
  /** 达到该段位所需分 */
  floor: number;
}

/** 段位表：青铜起步（初始 1000 = 白银） */
export const RANK_TIERS: RankTier[] = [
  { key: "bronze", label: "青铜学徒", floor: 0 },
  { key: "silver", label: "白银学者", floor: 1000 },
  { key: "gold", label: "黄金贤者", floor: 1100 },
  { key: "platinum", label: "铂金导师", floor: 1200 },
  { key: "diamond", label: "钻石大师", floor: 1350 },
  { key: "king", label: "王者祭酒", floor: 1500 },
];

export function rankFromRating(rating: number): RankTier {
  let tier = RANK_TIERS[0];
  for (const t of RANK_TIERS) {
    if (rating >= t.floor) tier = t;
  }
  return tier;
}

export interface PkOutcome {
  /** 1=答对 0=答错/超时 */
  c: 0 | 1;
  /** 用时毫秒 */
  t: number;
}

/** 比分：先比答对数，再比总用时（少者胜）。返回 1/0.5/0（视角=a） */
export function duelResult(a: PkOutcome[], b: PkOutcome[]): 0 | 0.5 | 1 {
  const score = (o: PkOutcome[]) => o.reduce((s, x) => s + x.c, 0);
  const time = (o: PkOutcome[]) => o.reduce((s, x) => s + x.t, 0);
  const sa = score(a);
  const sb = score(b);
  if (sa !== sb) return sa > sb ? 1 : 0;
  const ta = time(a);
  const tb = time(b);
  if (ta === tb) return 0.5;
  return ta < tb ? 1 : 0;
}
