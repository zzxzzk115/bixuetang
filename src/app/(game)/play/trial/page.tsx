import { redirect } from "next/navigation";
import { TrialHome } from "@/components/app/trial-home";
import { getCurrentUser } from "@/lib/auth/session";
import { getGameBootstrap } from "@/lib/game/bootstrap";

export const metadata = { title: "试炼场" };

export default async function TrialPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const bootstrap = getGameBootstrap(user);
  return <TrialHome bootstrap={bootstrap} />;
}
