import { redirect } from "next/navigation";
import { GameShell } from "@/components/game/game-shell";
import { getCurrentUser } from "@/lib/auth/session";
import { getGameBootstrap } from "@/lib/game/bootstrap";

export const metadata = { title: "公会大厅" };

// 全屏游戏入口。server component：鉴权 → 一次性注水 → 交给客户端 GameShell。
export default async function PlayPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const bootstrap = getGameBootstrap(user);
  return <GameShell bootstrap={bootstrap} />;
}
