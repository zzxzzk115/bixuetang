import Link from "next/link";
import { ArrowUpRight, Calculator, Cpu } from "lucide-react";
import type { LabId } from "@/lib/content/schema";

const ICON = { hack: Cpu, math: Calculator } as const;

export function FacilityCard({
  id,
  code,
  title,
  description,
  href,
  taskCount,
  doneCount,
}: {
  id: LabId;
  code: string;
  title: string;
  description: string;
  href: string;
  taskCount: number;
  doneCount: number;
}) {
  const Icon = ICON[id];
  const percent = taskCount === 0 ? 0 : Math.round((doneCount / taskCount) * 100);
  return (
    <Link href={href} className="facility-card" data-facility={id}>
      <div className="facility-card-head">
        <span className="facility-code">{code}</span>
        <span className="facility-status">ONLINE</span>
      </div>
      <div className="facility-card-body">
        <span className="facility-icon"><Icon aria-hidden size={25} strokeWidth={1.6} /></span>
        <div className="min-w-0">
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="facility-progress">
        <div className="flex justify-between">
          <span>设施任务 {doneCount}/{taskCount}</span>
          <span>{percent}%</span>
        </div>
        <div className="progress-track mt-1.5">
          <div className="progress-fill gold" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <div className="facility-card-foot">
        <span>{doneCount === taskCount && taskCount > 0 ? "设施已精通" : "可执行交互任务"}</span>
        <strong>进入设施 <ArrowUpRight aria-hidden size={14} /></strong>
      </div>
    </Link>
  );
}
