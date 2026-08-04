// 观看达标规则（纯常量/纯函数，"use server" 文件不能导出这些，单独放）

/** 观看覆盖率达到这个比例就算「看完」——跳着看也算，学习不是考勤 */
export const COMPLETE_RATIO = 0.9;

/** 覆盖率百分比（0~100） */
export function watchRatioPct(watchedSec: number, durationSec: number): number {
  if (!(durationSec > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round((watchedSec / durationSec) * 100)));
}

export function isComplete(ratioPct: number): boolean {
  return ratioPct >= COMPLETE_RATIO * 100;
}
