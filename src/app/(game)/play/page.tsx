import Link from "next/link";
import { redirect } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { RouteMap } from "@/components/app/route-map";
import { NextStepCard } from "@/components/app/next-step-card";
import { QuestFab } from "@/components/app/quest-fab";
import { getCurrentUser } from "@/lib/auth/session";
import { getGameBootstrap } from "@/lib/game/bootstrap";
import { pickNextStep } from "@/lib/game/next-step";
import { getDailyQuests, getMonthlyQuest } from "@/lib/game/quests";
import { getDueCount } from "@/lib/game/review-actions";
import { getContent } from "@/lib/content/load";
import { roadmapChoices } from "@/lib/game/roadmap-choices";

export const metadata = { title: "冒险地图" };

// App 主界面：多邻国式路线地图。server 注水一次，客户端纯 DOM 渲染。
// 每日任务：常驻卡片在试炼页；地图页用右下角悬浮任务栏（QuestFab），
// 随手可展开、可领奖，又不占地图的垂直空间。顶部只留强时效的复习入口。
export default async function PlayPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const bootstrap = getGameBootstrap(user);
  const quests = getDailyQuests(user.id);
  const monthly = getMonthlyQuest(user.id);
  const dueCount = await getDueCount();

  // 选定职业目标(成为 X)时,「下一步」按该路线的课程顺序推进
  const content = getContent();
  const goal = bootstrap.goalRoadmap
    ? content.roadmapsById.get(bootstrap.goalRoadmap)
    : undefined;
  const goalCourseIds = goal ? goal.stages.flatMap((s) => s.courses) : [];
  const nextStep = pickNextStep(bootstrap, goalCourseIds);
  const roadmaps = roadmapChoices(content.roadmaps);

  return (
    <RouteMap
      bootstrap={bootstrap}
      roadmaps={roadmaps}
      topSlot={
        <>
          <NextStepCard
            step={nextStep}
            goal={goal ? { id: goal.id, title: goal.title } : null}
          />
          {dueCount > 0 && (
            <Link href="/review" className="review-entry">
              <span className="review-entry-icon" aria-hidden>
                <RotateCcw size={18} />
              </span>
              <span className="review-entry-body">
                <b>今日复习</b>
                <small>{dueCount} 张卡片到期,清空续上记忆曲线</small>
              </span>
              <span className="review-entry-count">{dueCount}</span>
            </Link>
          )}
          {/* fixed 定位的悬浮任务栏,放在注入位不影响地图布局 */}
          <QuestFab quests={quests} monthly={monthly} />
        </>
      }
    />
  );
}
