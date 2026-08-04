import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

// 根路径只做分流：登录了进地图，没登录去扫码登录页。
// （旧的宣传首页已退役，内容在 git 历史里。）
export default async function RootPage() {
  const user = await getCurrentUser();
  redirect(user ? "/play" : "/login");
}
