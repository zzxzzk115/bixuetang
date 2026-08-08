import { notFound } from "next/navigation";
import { CareerSuggestionsAdmin } from "@/components/app/career-suggestions-admin";
import { listCareerSuggestions } from "@/lib/game/goal-actions";

export const metadata = { title: "职业目标建议" };
export const dynamic = "force-dynamic";

export default async function ConsoleCareerSuggestionsPage() {
  const rows = await listCareerSuggestions();
  if (rows === null) notFound();

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <h1>职业目标建议</h1>
        <p className="admin-muted">
          用户在目标选择里选「其他」时写下的想成为的角色。看看有没有值得新增的
          「成为 X」路线,处理完标记一下。
        </p>
      </header>
      <CareerSuggestionsAdmin initial={rows} />
    </div>
  );
}
