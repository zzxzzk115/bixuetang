import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { ReportsAdmin } from "@/components/app/reports-admin";
import { requireUser } from "@/lib/auth/session";
import { getGameBootstrap } from "@/lib/game/bootstrap";
import { listVideoReports } from "@/lib/game/report-actions";

export const metadata = { title: "视频反馈" };
export const dynamic = "force-dynamic";

// 运营页:看用户「视频不见了」的反馈,标记处理。非管理员直接 404,不暴露入口。
export default async function ReportsPage() {
  const user = await requireUser();
  const reports = await listVideoReports();
  if (reports === null) notFound(); // 非管理员

  const bootstrap = getGameBootstrap(user);
  return (
    <AppShell bootstrap={bootstrap}>
      <div className="app-page">
        <header className="app-page-head">
          <h1>视频失效反馈</h1>
          <p className="me-note">
            用户点「视频不见了」上报的问题。复核后给对应课程补备用搬运
            (source.mirrors / episode.mirrors),再标记已处理。
          </p>
        </header>
        <ReportsAdmin initial={reports} />
      </div>
    </AppShell>
  );
}
