import { redirect } from "next/navigation";
import { TrialHome } from "@/components/app/trial-home";
import { getCurrentUser } from "@/lib/auth/session";
import { getGameBootstrap } from "@/lib/game/bootstrap";
import { getPkOverview } from "@/lib/game/pk";
import { getLeagueOverview } from "@/lib/game/league-server";
import { getDailyQuests, getMonthlyQuest } from "@/lib/game/quests";
import { getDueCount } from "@/lib/game/review-actions";
import { getWellbeing } from "@/lib/game/wellbeing-actions";
import { getDailyProgress } from "@/lib/game/daily-goal-query";
import { getPublicName } from "@/lib/social/queries";
import { getMistakeCount } from "@/lib/game/mistakes";

export const metadata = { title: "试炼场" };

export default async function TrialPage({
  searchParams,
}: {
  searchParams: Promise<{ vs?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const bootstrap = getGameBootstrap(user);
  const quests = getDailyQuests(user.id);
  const monthly = getMonthlyQuest(user.id);
  const dueCount = await getDueCount();
  const { calmMode } = await getWellbeing();

  // 约战好友:?vs=<friendId> 带出对方名字,试炼页顶部弹约战横幅。
  const vsId = Number((await searchParams).vs);
  const challenge =
    !calmMode && Number.isInteger(vsId) && vsId !== user.id
      ? (() => {
          const name = getPublicName(vsId);
          return name ? { id: vsId, name } : null;
        })()
      : null;

  return (
    <TrialHome
      bootstrap={bootstrap}
      pk={getPkOverview(user.id)}
      league={getLeagueOverview(user.id)}
      calmMode={calmMode}
      dailyGoal={getDailyProgress(user.id)}
      quests={quests}
      monthly={monthly}
      dueCount={dueCount}
      mistakeCount={getMistakeCount(user.id)}
      challenge={challenge}
    />
  );
}
