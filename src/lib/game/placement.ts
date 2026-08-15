import "server-only";

import { getContent } from "../content/load";
import { getUserProgress } from "../progress/queries";
import { getQuizBank, courseHasQuiz } from "./quiz-bank";
import { drawQuiz, type QuizQuestion } from "./quiz-draw";

// 入学分级测:对一条路线,从「还没学完」的课依次出题,答对 ≥70% 的连续前缀
// 直接跳过(标记已学),落在第一门没测过的课——「你已掌握前 K 门,从这里开始」。
// 出题确定性(seed);交卷时服务端按同一 done 集 + seed 复现核对,分数不信客户端。

export const PLACEMENT_PER_COURSE = 4;
export const PLACEMENT_PASS_RATIO = 0.7;

export interface PlacementCourse {
  courseId: string;
  title: string;
  /** 这门课出了几题(用于交卷时切片计分) */
  count: number;
}

export interface Placement {
  seed: number;
  courses: PlacementCourse[];
  questions: QuizQuestion[];
}

/**
 * 可测序列:把路线课程按阶段顺序摊平,跳过已学完的,取「还没学完且有题库」的
 * 连续前缀——遇到第一门没题库的没学课就停(测不了,后面只能自己学)。
 */
export function placementSequence(
  userId: number,
  roadmapId: string,
): { courseId: string; title: string }[] {
  const roadmap = getContent().roadmapsById.get(roadmapId);
  if (!roadmap) return [];
  const byId = getContent().coursesById;
  const status = getUserProgress(userId).statusByCourse;
  const seq: { courseId: string; title: string }[] = [];
  for (const stage of roadmap.stages) {
    for (const cid of stage.courses) {
      const course = byId.get(cid);
      if (!course) continue;
      if (status.get(cid) === "done") continue; // 已学完,跳过
      if (!courseHasQuiz(cid)) return seq; // 没题库,测不了,序列到此为止
      seq.push({ courseId: cid, title: course.title });
    }
  }
  return seq;
}

/** 按 done 集 + seed 复现一套分级测(供出题与交卷共用,保证确定性)。 */
export function buildPlacementForSeed(
  userId: number,
  roadmapId: string,
  seed: number,
): { courses: PlacementCourse[]; questions: QuizQuestion[] } {
  const seq = placementSequence(userId, roadmapId);
  const bank = getQuizBank();
  const byId = getContent().coursesById;
  const courses: PlacementCourse[] = [];
  const questions: QuizQuestion[] = [];
  for (let i = 0; i < seq.length; i++) {
    const { courseId, title } = seq[i];
    const course = byId.get(courseId);
    if (!course) break;
    const qs = drawQuiz({
      pool: bank.byCourse.get(courseId) ?? [],
      fallback: bank.bySubject.get(course.subject) ?? [],
      count: PLACEMENT_PER_COURSE,
      seed: (seed ^ ((i + 1) << 10)) >>> 0,
    });
    if (qs.length === 0) break; // 这门凑不出题,序列到此为止
    courses.push({ courseId, title, count: qs.length });
    questions.push(...qs);
  }
  return { courses, questions };
}

/** 抽一套分级测;可测序列为空则返回 null(这条线要么学完了、要么没题库)。 */
export function drawPlacement(
  userId: number,
  roadmapId: string,
  now = Date.now(),
): Placement | null {
  const seed = (now ^ (userId << 16) ^ 0x71ace) >>> 0;
  const { courses, questions } = buildPlacementForSeed(userId, roadmapId, seed);
  if (courses.length === 0 || questions.length === 0) return null;
  return { seed, courses, questions };
}
