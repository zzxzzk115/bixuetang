import Link from "next/link";
import { Compass, Play } from "lucide-react";
import { SUBJECT_LABEL, type Subject } from "@/lib/content/schema";
import type { NextStep } from "@/lib/game/next-step";

// 「继续学习 / 下一步」推荐卡:挂在地图顶部,给用户一个明确的下一步,
// 免得面对满屏关卡不知道从哪开始。数据来自 pickNextStep(bootstrap)。
// 目标(成为 X)与「在爬哪条线」由上方的目标关系条展示,这里只管「接着学什么」。

export function NextStepCard({ step }: { step: NextStep }) {
  const { continue: cont, next } = step;
  if (!cont && !next) return null;

  return (
    <div className="nextstep-card">
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
    </div>
  );
}
