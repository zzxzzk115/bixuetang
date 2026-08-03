import { FacilityCard } from "@/components/facility-card";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { LAB_IDS } from "@/lib/content/schema";
import { LABS } from "@/lib/labs";
import { getLabTasksDone } from "@/lib/progress/queries";

export const metadata = { title: "实验设施" };

export default async function LabIndexPage() {
  const user = await getCurrentUser();
  const content = getContent();
  const facilities = LAB_IDS.map((id) => {
    const lab = LABS[id];
    const tasks = content.labTasksById.get(id)?.tasks ?? [];
    const done = user ? getLabTasksDone(user.id, id) : new Set<string>();
    return { id, lab, taskCount: tasks.length, doneCount: done.size };
  });
  const taskCount = facilities.reduce((sum, item) => sum + item.taskCount, 0);
  const doneCount = facilities.reduce((sum, item) => sum + item.doneCount, 0);

  return (
    <div className="page-stack">
      <header className="facility-hero">
        <div>
          <p className="page-kicker">GUILD WORKSHOP // 实战区域</p>
          <h1 className="page-title">实验设施</h1>
          <p className="page-lead">将课程中的抽象知识转化为可运行、可观察、可调试的装置与挑战。</p>
        </div>
        <div className="facility-hero-status">
          <span><b>{facilities.length}</b> ONLINE</span>
          <span><b>{doneCount}/{taskCount}</b> TASKS</span>
        </div>
      </header>

      <section>
        <div className="section-heading">
          <div>
            <p className="page-kicker">ACTIVE FACILITIES</p>
            <h2>开放设施</h2>
          </div>
          <span className="section-status">SYSTEMS NOMINAL</span>
        </div>
        <div className="facility-grid">
          {facilities.map(({ id, lab, taskCount: total, doneCount: done }) => (
            <FacilityCard
              key={id}
              id={id}
              code={lab.code}
              title={lab.title}
              description={lab.description}
              href={lab.href}
              taskCount={total}
              doneCount={done}
            />
          ))}
        </div>
      </section>

      <section className="workshop-protocol">
        <div>
          <p className="page-kicker">RESEARCH PROTOCOL</p>
          <h2>从观看到掌握</h2>
        </div>
        <ol>
          <li><b>01</b><span>从关联课程取得理论与任务背景</span></li>
          <li><b>02</b><span>在设施中运行、修改并观察结果</span></li>
          <li><b>03</b><span>完成设施目标，获得经验与成就</span></li>
        </ol>
      </section>
    </div>
  );
}
