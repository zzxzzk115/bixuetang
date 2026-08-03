import Link from "next/link";
import { LAB_IDS } from "@/lib/content/schema";
import { LABS } from "@/lib/labs";

export const metadata = { title: "实验工坊" };

export default function LabIndexPage() {
  return (
    <div className="page-stack mx-auto max-w-6xl">
      <header className="page-intro">
        <div>
          <p className="page-kicker">FIELD WORKSHOP // 实战设施</p>
          <h1 className="page-title">实验工坊</h1>
          <p className="page-lead">把课程中的抽象知识铸造成可运行、可观察、可调试的实验装置。</p>
        </div>
        <div className="hero-stat">
          <span className="hero-stat-value">{LAB_IDS.length}</span>
          <span className="hero-stat-label">座开放设施</span>
        </div>
      </header>

      <section>
        <div className="section-heading">
          <div><p className="page-kicker">ACTIVE FACILITIES</p><h2>可进入区域</h2></div>
        </div>
        <div className="dungeon-grid">
          {LAB_IDS.map((id, index) => {
            const lab = LABS[id];
            return (
              <Link key={id} href={lab.href} className="dungeon-card group">
                <div className="dungeon-card-topline">
                  <span>LAB {String(index + 1).padStart(2, "0")}</span>
                  <span className="subject-badge cs">LAB</span>
                </div>
                <h2 className="dungeon-title">{lab.title}</h2>
                <p className="dungeon-description">{lab.description}</p>
                <div className="dungeon-footer"><span>交互实验</span><strong>进入设施</strong></div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
