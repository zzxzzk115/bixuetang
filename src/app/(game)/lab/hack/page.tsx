import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, Circle, Cpu } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { DesktopOnly } from "@/components/app/desktop-only";
import { HackLabLoader } from "@/components/hack/hack-lab-loader";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { getGameBootstrap } from "@/lib/game/bootstrap";
import { getLabTasksDone } from "@/lib/progress/queries";

export const metadata = { title: "Hack 实验室" };

export default async function HackLabPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const bootstrap = getGameBootstrap(user);
  const tasks = getContent().labTasksById.get("hack")?.tasks ?? [];
  const done = getLabTasksDone(user.id, "hack");

  return (
    <AppShell bootstrap={bootstrap}>
      <div className="app-page app-course">
        <header className="course-hero" style={{ background: "var(--app-blue)" }}>
          <div className="course-hero-tags">
            <span>实验室</span>
            <span>nand2tetris</span>
          </div>
          <h1>
            <Cpu size={20} aria-hidden /> Hack 实验室
          </h1>
          <p>
            从 Hack 汇编、CPU、VM 到 Jack 编译器，整条 nand2tetris 工具链跑在浏览器里。
          </p>
          <Link className="course-hero-all" href="/courses/nand2tetris">
            去看对应课程 ›
          </Link>
        </header>

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
          <DesktopOnly title="Hack 实验室">
            <HackLabLoader />
          </DesktopOnly>
        </div>
      </div>
    </AppShell>
  );
}
