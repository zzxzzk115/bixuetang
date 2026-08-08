import { notFound } from "next/navigation";
import { TipsAdmin } from "@/components/admin/tips-admin";
import { listAllTips } from "@/lib/game/tips-actions";

export const metadata = { title: "课程心得审核" };
export const dynamic = "force-dynamic";

export default async function ConsoleTipsPage() {
  const rows = await listAllTips();
  if (rows === null) notFound();

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <h1>课程心得审核</h1>
        <p className="admin-muted">
          用户在课程页留下的学习心得。敏感词库只拦已收录的词,若有漏网或不当内容,
          在这里下架。下架不可撤销。
        </p>
      </header>
      <TipsAdmin initial={rows} />
    </div>
  );
}
