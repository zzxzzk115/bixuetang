import Link from "next/link";
import { redirect } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { DailyQuestBoard } from "@/components/daily-quest-board";
import { RouteMap } from "@/components/app/route-map";
import { getCurrentUser } from "@/lib/auth/session";
import { getGameBootstrap } from "@/lib/game/bootstrap";
import { getDueCount } from "@/lib/game/review-actions";
import { getDailyQuests } from "@/lib/game/quests";

export const metadata = { title: "冒险地图" };

// App 主界面：多邻国式路线地图。server 注水一次，客户端纯 DOM 渲染。
// 顶部挂每日任务板与「今日复习」入口——目标梯度:进度条与到期数
// 摆在最显眼的位置,离完成越近越想清掉。
export default async function PlayPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const bootstrap = getGameBootstrap(user);
  const quests = getDailyQuests(user.id);
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
          <DailyQuestBoard quests={quests} />
        </>
      }
    />
  );
}
