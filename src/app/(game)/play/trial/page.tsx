import { redirect } from "next/navigation";
import { TrialPlaceholder } from "@/components/app/trial-placeholder";
import { getCurrentUser } from "@/lib/auth/session";
import { getGameBootstrap } from "@/lib/game/bootstrap";

export const metadata = { title: "试炼场" };

// G3 里程碑落地前的占位页：保持 Tab 可达、说明即将到来的玩法。
export default async function TrialPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const bootstrap = getGameBootstrap(user);
  return <TrialPlaceholder bootstrap={bootstrap} />;
}
