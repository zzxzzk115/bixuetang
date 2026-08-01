"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth/session";
import { getContent } from "../content/load";
import { db } from "../db/client";
import { jobUnlocks, skillUnlocks, users } from "../db/schema";
import { skillPointsEarned } from "./level";
import { canPromote } from "./jobs";
import { coursesMet, spentPoints } from "./skills";
import {
  doneCourseIds,
  getHeldJobs,
  getUserProgress,
} from "../progress/queries";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** 点亮技能节点：前置已点亮 + 课程条件满足 + 技能点足够，三重服务端校验 */
export async function unlockSkill(skillId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  const content = getContent();
  const node = content.skillById.get(skillId);
  if (!node) return { ok: false, error: "技能节点不存在" };

  const progress = getUserProgress(user.id);
  if (progress.litSkills.has(skillId)) {
    return { ok: false, error: "该技能已点亮" };
  }
  if (!node.requires.every((r) => progress.litSkills.has(r))) {
    return { ok: false, error: "前置技能尚未点亮" };
  }
  if (!coursesMet(node, doneCourseIds(progress))) {
    return { ok: false, error: "关联课程尚未通关" };
  }
  const available =
    skillPointsEarned(progress.level.level) -
    spentPoints(content.skillNodes, progress.litSkills);
  if (available < node.cost) {
    return { ok: false, error: `技能点不足（需 ${node.cost}，剩 ${available}）` };
  }

  db.insert(skillUnlocks)
    .values({ userId: user.id, skillId, unlockedAt: Date.now() })
    .onConflictDoNothing()
    .run();

  revalidatePath("/skill-tree");
  revalidatePath("/jobs");
  revalidatePath("/me");
  return { ok: true };
}

/** 转职：满足条件后由用户手动触发（仪式感），写入 job_unlocks */
export async function promoteJob(jobId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  const content = getContent();
  const job = content.jobById.get(jobId);
  if (!job) return { ok: false, error: "职业不存在" };

  const held = getHeldJobs(user.id);
  if (held.has(jobId)) return { ok: false, error: "已持有该职业" };

  const progress = getUserProgress(user.id);
  const verdict = canPromote(job, {
    level: progress.level.level,
    litSkills: progress.litSkills,
    heldJobs: held,
  });
  if (!verdict.ok) return { ok: false, error: "转职条件尚未达成" };

  db.insert(jobUnlocks)
    .values({ userId: user.id, jobId, attainedAt: Date.now() })
    .onConflictDoNothing()
    .run();
  // 首次转职自动佩戴新称号
  if (!user.activeJobId) {
    db.update(users)
      .set({ activeJobId: jobId })
      .where(eq(users.id, user.id))
      .run();
  }

  revalidatePath("/jobs");
  revalidatePath("/me");
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 佩戴称号：只能选择已持有的职业 */
export async function setActiveTitle(jobId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };
  if (!getHeldJobs(user.id).has(jobId)) {
    return { ok: false, error: "尚未持有该职业" };
  }
  db.update(users)
    .set({ activeJobId: jobId })
    .where(eq(users.id, user.id))
    .run();
  revalidatePath("/jobs");
  revalidatePath("/me");
  revalidatePath("/", "layout");
  return { ok: true };
}
