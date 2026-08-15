import "server-only";

import { getContent } from "../content/load";
import { getQuizBank, courseHasQuiz } from "./quiz-bank";
import { drawQuiz, type QuizQuestion } from "./quiz-draw";

// 课程综合测验(跳级考):从整门课的题库抽一套题,答对 ≥70% 即可跳过本课——
// 本课全部标记为已学、解锁后续课程,并发一次性固定奖励(不按集算)。
// 出题确定性(seed),交卷时服务端按同 seed 重抽核对答案,分数不信客户端转述。

/** 跳级考题数 */
export const EXAM_SIZE = 10;
/** 通过线:答对比例 ≥ 此值 */
export const EXAM_PASS_RATIO = 0.7;
/** 至少能出这么多题才允许开跳级考(题库太薄凑不出像样的考卷) */
const MIN_EXAM_QUESTIONS = 6;

export interface CourseExam {
  seed: number;
  questions: QuizQuestion[];
}

/** 这门课能不能开跳级考(题库够 + 有综合测验资格) */
export function courseExamEligible(courseId: string): boolean {
  return courseHasQuiz(courseId);
}

/** 按给定 seed 复现一套考题(出题确定性);题库不足返回空数组。 */
export function examQuestionsForSeed(
  courseId: string,
  seed: number,
): QuizQuestion[] {
  const course = getContent().coursesById.get(courseId);
  if (!course || !courseHasQuiz(courseId)) return [];
  const bank = getQuizBank();
  const pool = bank.byCourse.get(courseId) ?? [];
  return drawQuiz({
    pool,
    fallback: bank.bySubject.get(course.subject) ?? [],
    count: EXAM_SIZE,
    seed: seed >>> 0,
  });
}

/** 抽一套跳级考题;题库不足返回 null。seed 内联时间,交卷据此复现核对。 */
export function drawCourseExam(
  userId: number,
  courseId: string,
  now = Date.now(),
): CourseExam | null {
  const seed = (now ^ (userId << 16) ^ 0x5ca1e) >>> 0;
  const questions = examQuestionsForSeed(courseId, seed);
  if (questions.length < MIN_EXAM_QUESTIONS) return null;
  return { seed, questions };
}
