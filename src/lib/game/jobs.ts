import type { Job } from "../content/schema";

// 转职判定（纯函数）。满足条件后由用户在 /jobs 页手动点「转职」写入 job_unlocks。

export interface PromoteInput {
  level: number;
  litSkills: Set<string>;
  heldJobs: Set<string>;
}

export interface PromoteVerdict {
  ok: boolean;
  missingParents: string[];
  missingLevel: number; // 还差多少级，0 表示满足
  missingAllOf: string[];
  /** anyOf 还差几个，0 表示满足 */
  missingAnyOfCount: number;
}

export function canPromote(job: Job, input: PromoteInput): PromoteVerdict {
  const missingParents = job.parents.filter((p) => !input.heldJobs.has(p));

  const minLevel = job.requires.minLevel ?? 1;
  const missingLevel = Math.max(0, minLevel - input.level);

  const skills = job.requires.skills;
  const missingAllOf = (skills?.allOf ?? []).filter(
    (s) => !input.litSkills.has(s),
  );

  let missingAnyOfCount = 0;
  if (skills && skills.anyOf.length > 0) {
    const hit = skills.anyOf.filter((s) => input.litSkills.has(s)).length;
    missingAnyOfCount = Math.max(0, skills.minAnyOf - hit);
  }

  return {
    ok:
      missingParents.length === 0 &&
      missingLevel === 0 &&
      missingAllOf.length === 0 &&
      missingAnyOfCount === 0,
    missingParents,
    missingLevel,
    missingAllOf,
    missingAnyOfCount,
  };
}
