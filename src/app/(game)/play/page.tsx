import Link from "next/link";
import { redirect } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { RouteMap } from "@/components/app/route-map";
import { QuestFab } from "@/components/app/quest-fab";
import { getCurrentUser } from "@/lib/auth/session";
import { getGameBootstrap } from "@/lib/game/bootstrap";
import { getDailyQuests, getMonthlyQuest } from "@/lib/game/quests";
import { getDueCount } from "@/lib/game/review-actions";

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

  return (
    <RouteMap
      bootstrap={bootstrap}
      topSlot={
        <>
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
