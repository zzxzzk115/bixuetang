import { notFound } from "next/navigation";
import { ReportsAdmin } from "@/components/app/reports-admin";
import { listVideoReports } from "@/lib/game/report-actions";

export const metadata = { title: "视频反馈 · 管理端" };
export const dynamic = "force-dynamic";

// 视频失效反馈模块。外层 admin/layout 已把关权限,这里再取一次数据兜底。
export default async function AdminReportsPage() {
  const reports = await listVideoReports();
  if (reports === null) notFound();

  return (
    <section className="admin-section">
      <p className="me-note admin-section-intro">
        用户点「视频不见了」上报的问题。复核后给对应课程补备用搬运
        (source.mirrors / episode.mirrors),再标记已处理。
      </p>
      <ReportsAdmin initial={reports} />
    </section>
  );
}
