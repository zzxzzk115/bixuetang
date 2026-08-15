import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExamSession } from "@/components/app/exam-session";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { getGameBootstrap } from "@/lib/game/bootstrap";
import { getUserProgress } from "@/lib/progress/queries";
import { courseHasQuiz } from "@/lib/game/quiz-bank";
import { drawCourseExam } from "@/lib/game/course-exam";

export const metadata = { title: "跳级考" };
export const dynamic = "force-dynamic";

// 跳级考页(全屏,不套 AppShell,与答题会话一脉)。
// 进门条件:登录 + 课程存在 + 支持跳级(题库够) + 已解锁 + 尚未学完。
export default async function CourseExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const course = getContent().coursesById.get(id);
  if (!course) notFound();

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!courseHasQuiz(id)) redirect(`/courses/${id}`);

  // 未解锁 → 回课程页(那里有解锁提示);已学完 → 没必要再跳级
  const summary = getGameBootstrap(user).courses.find((c) => c.id === id);
  if (summary && !summary.unlocked) redirect(`/courses/${id}`);
  if (getUserProgress(user.id).statusByCourse.get(id) === "done") {
    redirect(`/courses/${id}`);
  }

  const exam = drawCourseExam(user.id, id);
  if (!exam) {
    return (
      <div className="app-page course-locked">
        <h1>暂时没法跳级</h1>
        <p>这门课的题库还不够出一套综合测验,先按集学习吧。</p>
        <Link className="app-btn-primary" href={`/courses/${id}`}>
          回课程页
        </Link>
      </div>
    );
  }

  return (
    <ExamSession
      courseId={id}
      courseTitle={course.title}
      seed={exam.seed}
      questions={exam.questions}
    />
  );
}
