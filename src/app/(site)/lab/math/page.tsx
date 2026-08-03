import Link from "next/link";
import { Calculator, Check, Circle } from "lucide-react";
import { MathLabLoader } from "@/components/math/math-lab-loader";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { getLabTasksDone } from "@/lib/progress/queries";

export const metadata = { title: "数学演算设施" };

export default async function MathLabPage({
  searchParams,
}: {
  searchParams: Promise<{ expr?: string }>;
}) {
  const { expr } = await searchParams;
  const user = await getCurrentUser();
  const tasks = getContent().labTasksById.get("math")?.tasks ?? [];
  const done = user ? getLabTasksDone(user.id, "math") : new Set<string>();

  return (
    <div className="page-stack">
      <header className="facility-detail-head">
        <span className="facility-detail-icon"><Calculator aria-hidden size={28} /></span>
        <div>
          <p className="page-kicker">FAC-M02 // MATHEMATICS FACILITY</p>
          <h1 className="page-title">数学演算设施</h1>
          <p className="page-lead">在本地完成公式求值、化简、符号求导与函数图像实验。</p>
        </div>
      </header>
      <section className="lab-task-panel">
        <div><p className="page-kicker">FACILITY OBJECTIVES</p><h2>设施目标</h2></div>
        <ul>
          {tasks.map((task) => {
            const complete = done.has(task.id);
            return (
              <li key={task.id} className={complete ? "complete" : ""}>
                {complete ? <Check aria-hidden size={15} /> : <Circle aria-hidden size={13} />}
                <span><b>{task.title}</b><small>{task.description}</small></span>
                <strong>+{task.xp} XP</strong>
              </li>
            );
          })}
        </ul>
        {!user && <Link href="/login" className="lab-login">登录后记录设施成果 →</Link>}
      </section>
      <MathLabLoader initialExpr={expr} />
    </div>
  );
}
