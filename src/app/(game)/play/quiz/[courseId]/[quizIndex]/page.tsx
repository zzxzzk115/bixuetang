import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { QuizSession } from "@/components/app/quiz-session";
import { getCurrentUser } from "@/lib/auth/session";
import { getCourseQuiz } from "@/lib/game/quiz-actions";

export const metadata = { title: "阶段测验" };

// 地图测验节点的全屏答题页。服务端出题（seed 随机），客户端只跑会话。
export default async function QuizPage({
  params,
}: {
  params: Promise<{ courseId: string; quizIndex: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { courseId, quizIndex } = await params;
  const idx = Number(quizIndex);
  if (!Number.isInteger(idx) || idx < 0) notFound();

  const payload = await getCourseQuiz(courseId, idx);
  if (!payload.ok || !payload.questions) {
    if (payload.error === "测验不存在") notFound();
    return (
      <div className="quiz-root">
        <div className="quiz-result">
          <h1>暂时无法出题</h1>
          <p className="quiz-result-note">{payload.error}</p>
          <div className="quiz-result-actions">
            <Link className="app-btn-primary" href="/play">
              回到地图
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    // key 绑 seed：「重新挑战」走 router.refresh() 换一套题时强制重挂载会话
    <QuizSession
      key={payload.seed}
      mode="lesson"
      questions={payload.questions}
      timeLimitSec={payload.timeLimitSec ?? 15}
      courseId={courseId}
      quizIndex={idx}
    />
  );
}
