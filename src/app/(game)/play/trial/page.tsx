import { redirect } from "next/navigation";
import { TrialHome } from "@/components/app/trial-home";
import { getCurrentUser } from "@/lib/auth/session";
import { getGameBootstrap } from "@/lib/game/bootstrap";
import { getPkOverview } from "@/lib/game/pk";
import { getLeagueOverview } from "@/lib/game/league-server";
import { getDailyQuests, getMonthlyQuest } from "@/lib/game/quests";
import { getDueCount } from "@/lib/game/review-actions";

export const metadata = { title: "试炼场" };

export default async function TrialPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const bootstrap = getGameBootstrap(user);
  const quests = getDailyQuests(user.id);
  const monthly = getMonthlyQuest(user.id);
  const dueCount = await getDueCount();
  return (
    <TrialHome
      bootstrap={bootstrap}
      pk={getPkOverview(user.id)}
      league={getLeagueOverview(user.id)}
      quests={quests}
      monthly={monthly}
      dueCount={dueCount}
    />
  );
}
