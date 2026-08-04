import { redirect } from "next/navigation";
import { BagHome } from "@/components/app/bag-home";
import { getCurrentUser } from "@/lib/auth/session";
import { getGameBootstrap } from "@/lib/game/bootstrap";

export const metadata = { title: "背包" };

export default async function BagPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const bootstrap = getGameBootstrap(user);
  return <BagHome bootstrap={bootstrap} />;
}
