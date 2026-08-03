import Link from "next/link";
import { Check, Circle, Cpu } from "lucide-react";
import { HackLabLoader } from "@/components/hack/hack-lab-loader";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { getLabTasksDone } from "@/lib/progress/queries";

export const metadata = { title: "Hack 计算机工坊" };

export default async function HackLabPage() {
  const user = await getCurrentUser();
  const tasks = getContent().labTasksById.get("hack")?.tasks ?? [];
  const done = user ? getLabTasksDone(user.id, "hack") : new Set<string>();

  return (
    <div className="page-stack">
      <header className="facility-detail-head">
        <span className="facility-detail-icon"><Cpu aria-hidden size={28} /></span>
        <div className="min-w-0 flex-1">
          <p className="page-kicker">FAC-H01 // COMPUTING FACILITY</p>
          <h1 className="page-title">Hack 计算机工坊</h1>
          <p className="page-lead">从 Hack 汇编、CPU、VM 到 Jack 编译器，在浏览器内运行完整 Nand2Tetris 工具链。</p>
        </div>
        <Link href="/courses/nand2tetris" className="command-button secondary">关联副本</Link>
      </header>

      <section className="lab-task-panel">
        <div>
          <p className="page-kicker">FACILITY OBJECTIVES</p>
          <h2>设施目标</h2>
        </div>
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
      <HackLabLoader />
    </div>
  );
}
