// 统一的「学习日」计算。
//
// 之前 streak 用 UTC 日切,中国用户晚上 8 点后学的都被算成「明天」,
// 连胜断得莫名其妙。站点面向中文学习者,日切固定 UTC+8——
// 比读浏览器时区可预测(服务端没有浏览器时区,两边还会对不上)。

const DAY_MS = 24 * 60 * 60 * 1000;
const TZ_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 形如 "2026-08-07" 的学习日键(UTC+8 日切) */
export function dayKey(now: number = Date.now()): string {
  return new Date(now + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** b - a 的天数差(键格式同 dayKey;a、b 顺序颠倒时为负) */
export function diffDays(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  return Math.round((tb - ta) / DAY_MS);
}

/** dayKey 加 n 天 */
export function addDays(key: string, n: number): string {
  const t = Date.parse(`${key}T00:00:00Z`);
  return new Date(t + n * DAY_MS).toISOString().slice(0, 10);
}
