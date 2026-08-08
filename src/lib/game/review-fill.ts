// 填空(主动回忆)题的判定与判分。纯函数、无 I/O,服务端判分与单测共用。
//
// 主动回忆(看定义打出术语)是记忆效果最强的题型,但对「拼写/标点/大小写/
// 全半角」的小差异要宽容,否则记住了却判错很打击人。判分策略:归一化后
// 完全一致 / 一方包含另一方 / 编辑距离在容差内 → 判对。

/** 术语超过这个长度就不做填空(太长打不出来,退回四选一) */
export const FILL_MAX_TERM_LEN = 14;
/** 复习到第几次(reps)才把这张 term 卡升级成填空——先四选一托底,再主动回忆 */
export const FILL_MIN_REPS = 2;

/** 归一化:全角转半角 → 小写 → 去空白与常见标点 */
export function normalizeFill(s: string): string {
  return s
    .replace(/[！-～]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
    )
    .replace(/　/g, " ")
    .toLowerCase()
    .replace(/[\s]+/g, "")
    .replace(/[，。、；：！？,.;:!?()（）【】\[\]{}"'`·\-_/\\|~@#￥%…&*]/g, "");
}

/** 这张卡该不该出成填空:只对短术语、且已复习过几次的卡 */
export function shouldFillIn(
  kind: "term" | "keypoint",
  reps: number,
  term: string,
): boolean {
  if (kind !== "term") return false;
  if (reps < FILL_MIN_REPS) return false;
  const t = term.trim();
  return t.length > 0 && t.length <= FILL_MAX_TERM_LEN;
}

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let cur = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

function matchesOne(a: string, b: string): boolean {
  if (!b) return false;
  if (a === b) return true;
  // 一方包含另一方(都≥3 才允许,避免一两个字就蒙对)
  if (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a))) {
    return true;
  }
  // 编辑距离容差随长度放宽:短词要求严,长词容 1–2 个字的笔误
  const tol = b.length <= 4 ? 0 : b.length <= 8 ? 1 : 2;
  return editDistance(a, b) <= tol;
}

/**
 * 判填空作答是否算对(宽容拼写/标点/大小写/全半角)。
 * 术语常是「英文 中文」双语(如 "weight 权重"),按空格/常见分隔切成片段,
 * 打出整条或任一片段(weight / 权重)都算对——记住了就不该被格式卡。
 */
export function gradeFill(input: string, answer: string): boolean {
  const a = normalizeFill(input);
  if (!a) return false;
  // 候选:整条 + 各分隔片段(片段至少 2 字,防单字蒙对)
  const parts = answer.split(/[\s/／、,，;；|]+/).filter((p) => p.trim());
  const candidates = [
    normalizeFill(answer),
    ...parts.map(normalizeFill).filter((p) => p.length >= 2),
  ];
  return candidates.some((b) => matchesOne(a, b));
}
