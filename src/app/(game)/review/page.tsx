import { redirect } from "next/navigation";
import { ReviewSession } from "@/components/app/review-session";
import { getCurrentUser } from "@/lib/auth/session";
import { getDueReview } from "@/lib/game/review-actions";

export const metadata = { title: "今日复习" };
export const dynamic = "force-dynamic";

// 今日复习:到期的间隔重复卡逐张四选一。
// 服务端出题(题面/干扰项都在这里定),客户端只管答题交互。
export default async function ReviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const due = await getDueReview();
  if ("error" in due) redirect("/login");

  return <ReviewSession cards={due.cards} />;
}
