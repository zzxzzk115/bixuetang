import Link from "next/link";
import { Inbox, Library, ShieldCheck } from "lucide-react";
import { getContent } from "@/lib/content/load";
import { listVideoReports } from "@/lib/game/report-actions";

export const metadata = { title: "管理端" };
export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const reports = (await listVideoReports()) ?? [];
  const pending = reports.filter((r) => !r.resolved).length;
  const { courses } = getContent();

  return (
    <>
      <div className="admin-stats">
        <Link href="/admin/reports" className="admin-stat-card">
          <Inbox size={20} aria-hidden />
          <b>{pending}</b>
          <span>待处理反馈</span>
        </Link>
        <div className="admin-stat-card is-static">
          <Library size={20} aria-hidden />
          <b>{courses.length}</b>
          <span>在册课程</span>
        </div>
        <div className="admin-stat-card is-static">
          <ShieldCheck size={20} aria-hidden />
          <b>{reports.length}</b>
          <span>历史反馈</span>
        </div>
      </div>

      <section className="course-card">
        <div className="course-card-head">
          <h2>模块</h2>
        </div>
        <div className="admin-modules">
          <Link href="/admin/reports" className="admin-module">
            <Inbox size={18} aria-hidden />
            <div>
              <b>视频失效反馈</b>
              <small>
                用户「视频不见了」上报。复核后补备用搬运
                (source.mirrors / episode.mirrors)再标记处理。
              </small>
            </div>
            {pending ? <span className="admin-badge">{pending}</span> : null}
          </Link>
        </div>
      </section>

      <section className="course-card">
        <div className="course-card-head">
          <h2>自动巡检</h2>
        </div>
        <p className="me-note">
          每周定时 CI(video-health.yml)游客态扫全站稿件,发现确证失效且无备源的
          会自动开 issue。也可本地手动跑 <code>npm run check:videos</code>,台账见
          <code> scratch/video-health.md</code>。
        </p>
      </section>
    </>
  );
}
