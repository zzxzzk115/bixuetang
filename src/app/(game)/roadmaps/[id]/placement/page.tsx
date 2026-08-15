import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PlacementExam } from "@/components/app/placement-exam";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { drawPlacement } from "@/lib/game/placement";

export const metadata = { title: "入学分级测" };
export const dynamic = "force-dynamic";

// 分级测页(全屏,不套 AppShell)。抽不出题(路线学完了或没题库)时给回退提示。
export default async function PlacementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const roadmap = getContent().roadmapsById.get(id);
  if (!roadmap) notFound();

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const placement = drawPlacement(user.id, id);
  if (!placement) {
    return (
      <div className="app-page course-locked">
        <h1>暂时没法分级测</h1>
        <p>这条线要么你已经学得差不多了,要么开头几门还没有题库,按部就班学更稳。</p>
        <Link className="app-btn-primary" href={`/roadmaps/${id}`}>
          回到路线
        </Link>
      </div>
    );
  }

  // 每题对应哪门课(与 questions 等长),供答题页标注来源
  const questionCourse: string[] = [];
  for (const c of placement.courses) {
    for (let i = 0; i < c.count; i++) questionCourse.push(c.title);
  }

  return (
    <PlacementExam
      roadmapId={id}
      roadmapTitle={roadmap.title}
      seed={placement.seed}
      questions={placement.questions}
      questionCourse={questionCourse}
    />
  );
}
