import { notFound } from "next/navigation";
import { ReportsAdmin } from "@/components/app/reports-admin";
import { listVideoReports } from "@/lib/game/report-actions";

export const metadata = { title: "视频反馈" };
export const dynamic = "force-dynamic";

export default async function ConsoleReportsPage() {
  const reports = await listVideoReports();
  if (reports === null) notFound();

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <h1>视频失效反馈</h1>
        <p className="admin-muted">
          用户点「视频不见了」上报的问题。复核后给对应课程补备用搬运
          (source.mirrors / episode.mirrors),再标记已处理。
        </p>
      </header>
      <ReportsAdmin initial={reports} />
    </div>
  );
}
