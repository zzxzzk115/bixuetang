// 时间/时长格式化的单一出处(纯函数,server/client 都能用)。
// 此前 fmtTime 在 export/format、video-notes、app-analysis-map 各写一份。

/** 两位补零 */
export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 秒 → mm:ss(超过一小时给 h:mm:ss) */
export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(ss)}` : `${m}:${pad2(ss)}`;
}

/** 分钟 → 「H 小时 M 分」/「M 分钟」 */
export function hoursText(min: number): string {
  const total = Math.max(0, Math.floor(min));
  if (total < 60) return `${total} 分钟`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
}
