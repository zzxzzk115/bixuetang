import { BrainCircuit } from "lucide-react";
import { LEVEL_LABEL, SUBJECT_LABEL, type Level, type Subject } from "@/lib/content/schema";
import type { CourseStatus } from "@/lib/db/schema";

const LEVEL_STYLE: Record<Level, string> = {
  basic: "border-xp/60 text-xp",
  intermediate: "border-mana/60 text-mana",
  advanced: "border-hp/60 text-hp",
};

export function LevelBadge({ level }: { level: Level }) {
  return (
    <span className={`inline-block border bg-background/50 px-1.5 py-0.5 font-mono text-[10px] ${LEVEL_STYLE[level]}`}>
      {LEVEL_LABEL[level]}
    </span>
  );
}

const SUBJECT_GLYPH: Record<Exclude<Subject, "ai">, string> = {
  cs: "</>",
  math: "Σ",
  physics: "φ",
};

export function SubjectIcon({
  subject,
  className = "",
}: {
  subject: Subject;
  className?: string;
}) {
  if (subject === "ai") {
    return (
      <BrainCircuit
        aria-hidden="true"
        width="1em"
        height="1em"
        strokeWidth={1.8}
        className={className}
      />
    );
  }
  return (
    <span aria-hidden="true" className={className}>
      {SUBJECT_GLYPH[subject]}
    </span>
  );
}

export function SubjectBadge({ subject }: { subject: Subject }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted">
      <SubjectIcon subject={subject} className="text-gold" />
      {SUBJECT_LABEL[subject]}
    </span>
  );
}

export const STATUS_LABEL: Record<CourseStatus, string> = {
  planned: "待命",
  learning: "攻略中",
  done: "已讨伐",
  dropped: "已撤退",
};

const STATUS_STYLE: Record<CourseStatus, string> = {
  planned: "border-edge text-muted",
  learning: "border-mana/60 text-mana",
  done: "border-gold/70 text-gold",
  dropped: "border-edge text-muted line-through",
};

export function StatusBadge({ status }: { status: CourseStatus }) {
  return (
    <span className={`inline-block border bg-background/50 px-1.5 py-0.5 font-mono text-[10px] ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
