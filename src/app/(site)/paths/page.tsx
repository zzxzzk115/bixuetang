import Link from "next/link";
import { ArrowRight, MapPinned } from "lucide-react";
import { SubjectIcon } from "@/components/badges";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { SUBJECT_LABEL, SUBJECTS } from "@/lib/content/schema";
import { getUserProgress } from "@/lib/progress/queries";

export const metadata = { title: "远征地图" };

const REGION = {
  cs: { code: "REGION C", name: "机械大陆" },
  math: { code: "REGION M", name: "符文高塔" },
  physics: { code: "REGION P", name: "观测荒原" },
  ai: { code: "REGION A", name: "智械前线" },
} as const;

export default async function PathsPage() {
  const content = getContent();
  const user = await getCurrentUser();
  const progress = user ? getUserProgress(user.id) : null;

  return (
    <div className="page-stack">
      <header className="world-map-head">
        <div>
          <p className="page-kicker">WORLD CAMPAIGN // 学科疆域</p>
          <h1 className="page-title">远征地图</h1>
          <p className="page-lead">自主选择一条学习路线。路线内部严格按章节顺序由浅入深推进，并最终导向技能与职业构筑。</p>
        </div>
        <MapPinned aria-hidden size={54} strokeWidth={1.1} />
      </header>

      <div className="world-regions">
        {SUBJECTS.map((subject) => {
          const paths = content.paths.filter((path) => path.subject === subject);
          return (
            <section key={subject} className="world-region" data-subject={subject}>
              <header className="region-heading">
                <span className="region-icon"><SubjectIcon subject={subject} /></span>
                <div>
                  <p className="page-kicker">{REGION[subject].code}</p>
                  <h2>{REGION[subject].name}</h2>
                  <span>{SUBJECT_LABEL[subject]} · {paths.length} 条可部署路线</span>
                </div>
              </header>
              <div className="region-paths">
                {paths.map((path) => {
                  const courseIds = path.stages.flatMap((stage) => stage.courses);
                  const done = progress
                    ? courseIds.filter((id) => progress.statusByCourse.get(id) === "done").length
                    : 0;
                  const percent = Math.round((done / courseIds.length) * 100);
                  return (
                    <Link key={path.id} href={`/paths/${path.id}`} className="region-path">
                      <div className="region-path-top">
                        <span>{path.stages.length} CHAPTERS</span>
                        <b>{done}/{courseIds.length}</b>
                      </div>
                      <h3>{path.title}</h3>
                      <p>{path.description}</p>
                      <div className="mt-auto pt-4">
                        <div className="progress-track"><div className="progress-fill gold" style={{ width: `${percent}%` }} /></div>
                        <span className="region-path-deploy">部署路线 <ArrowRight aria-hidden size={13} /></span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
