import { redirect } from "next/navigation";
import { RouteMap } from "@/components/app/route-map";
import { getCurrentUser } from "@/lib/auth/session";
import { getGameBootstrap } from "@/lib/game/bootstrap";

export const metadata = { title: "冒险地图" };

// App 主界面：多邻国式路线地图。server 注水一次，客户端纯 DOM 渲染。
export default async function PlayPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const bootstrap = getGameBootstrap(user);
  return <RouteMap bootstrap={bootstrap} />;
}
