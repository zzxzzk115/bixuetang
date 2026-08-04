import Link from "next/link";
import { redirect } from "next/navigation";
import { Calculator, Check, Circle } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { DesktopOnly } from "@/components/app/desktop-only";
import { MathLabLoader } from "@/components/math/math-lab-loader";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { getGameBootstrap } from "@/lib/game/bootstrap";
import { getLabTasksDone } from "@/lib/progress/queries";

export const metadata = { title: "数学工坊" };

export default async function MathLabPage({
  searchParams,
}: {
  searchParams: Promise<{ expr?: string }>;
}) {
  const { expr } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const bootstrap = getGameBootstrap(user);
  const tasks = getContent().labTasksById.get("math")?.tasks ?? [];
  const done = getLabTasksDone(user.id, "math");

  return (
    <AppShell bootstrap={bootstrap} wide>
      <div className="app-page app-course">
        <header
          className="course-hero"
          style={{ background: "var(--app-teal)" }}
        >
          <div className="course-hero-tags">
            <span>工坊</span>
            <span>符号计算</span>
          </div>
          <h1>
            <Calculator size={20} aria-hidden /> 数学工坊
          </h1>
          <p>公式求值、化简、符号求导与函数图像，全部在本地算，不上传。</p>
        </header>

        {/* 两个工坊之间要能互相走，否则进来就出不去了 */}
        <nav className="lab-switch">
          <span className="active">数学工坊</span>
          <Link href="/lab/hack">Hack 实验室 ›</Link>
        </nav>

        <section className="course-card">
          <div className="course-card-head">
            <h2>实验目标</h2>
          </div>
          <ul className="lab-goals">
            {tasks.map((task) => {
              const complete = done.has(task.id);
              return (
                <li key={task.id} className={complete ? "complete" : ""}>
                  {complete ? (
                    <Check size={15} aria-hidden />
                  ) : (
                    <Circle size={13} aria-hidden />
                  )}
                  <span>
                    <b>{task.title}</b>
                    <small>{task.description}</small>
                  </span>
                  <strong>+{task.xp} XP</strong>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="course-card app-skin">
          <DesktopOnly title="数学工坊">
            <MathLabLoader initialExpr={expr} />
          </DesktopOnly>
        </div>
      </div>
    </AppShell>
  );
}
