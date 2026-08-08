import Link from "next/link";
import { Compass, Play, Route, Target } from "lucide-react";
import { SUBJECT_LABEL, type Subject } from "@/lib/content/schema";
import type { NextStep } from "@/lib/game/next-step";

// 「继续学习 / 下一步」推荐卡:挂在地图顶部,给用户一个明确的下一步,
// 免得面对满屏关卡不知道从哪开始。数据来自 pickNextStep(bootstrap)。
// 选了职业目标(成为 X)时顶部亮出目标,下一步即按该路线推进。

export function NextStepCard({
  step,
  goal,
}: {
  step: NextStep;
  /** 选定的职业目标(成为 X),未选则 null */
  goal?: { id: string; title: string } | null;
}) {
  const { continue: cont, next } = step;
  if (!cont && !next) return null;

  return (
    <div className="nextstep-card">
      {goal ? (
        <Link href={`/roadmaps/${goal.id}`} className="nextstep-goal">
          <Target size={14} aria-hidden />
          <span>
            目标 · <b>{goal.title}</b>
          </span>
        </Link>
      ) : null}

      {cont ? (
        <Link
          href={`/courses/${cont.courseId}?ep=${cont.episodeN}`}
          className="nextstep-row"
        >
          <span className="nextstep-icon primary" aria-hidden>
            <Play size={17} />
          </span>
          <span className="nextstep-body">
            <b>继续上次</b>
            <small>
              {cont.title} · 第 {cont.episodeN} 集
              {cont.ratioPct > 0 ? ` · 已看 ${cont.ratioPct}%` : ""}
            </small>
          </span>
        </Link>
      ) : null}

      {next ? (
        <Link href={`/courses/${next.courseId}`} className="nextstep-row">
          <span className="nextstep-icon" aria-hidden>
            <Compass size={17} />
          </span>
          <span className="nextstep-body">
            <b>下一步{cont ? "" : "，从这里开始"}</b>
            <small>
              {next.title} · {SUBJECT_LABEL[next.subject as Subject] ?? next.subject}
            </small>
          </span>
        </Link>
      ) : null}

      <Link
        href={goal ? `/roadmaps/${goal.id}` : "/roadmaps"}
        className="nextstep-roadmap"
      >
        <Route size={15} aria-hidden />
        {goal ? "查看完整路线 →" : "看完整学习路线：成为 X →"}
      </Link>
    </div>
  );
}
