import {
  LEVEL_LABEL,
  SUBJECT_LABEL,
  type Level,
  type Subject,
} from "@/lib/content/schema";
import type { CourseStatus } from "@/lib/db/schema";

const LEVEL_STYLE: Record<Level, string> = {
  basic: "bg-emerald-950 text-emerald-300 border-emerald-800",
  intermediate: "bg-sky-950 text-sky-300 border-sky-800",
  advanced: "bg-purple-950 text-purple-300 border-purple-800",
};

export function LevelBadge({ level }: { level: Level }) {
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-xs ${LEVEL_STYLE[level]}`}
    >
      {LEVEL_LABEL[level]}
    </span>
  );
}

const SUBJECT_ICON: Record<Subject, string> = {
  cs: "⚔️",
  math: "🔮",
  physics: "🌌",
  ai: "🤖",
};

export function SubjectBadge({ subject }: { subject: Subject }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      {SUBJECT_ICON[subject]} {SUBJECT_LABEL[subject]}
    </span>
  );
}

export const STATUS_LABEL: Record<CourseStatus, string> = {
  planned: "想学",
  learning: "在学",
  done: "已通关",
  dropped: "搁置",
};

const STATUS_STYLE: Record<CourseStatus, string> = {
  planned: "bg-edge text-muted border-edge",
  learning: "bg-sky-950 text-sky-300 border-sky-800",
  done: "bg-amber-950 text-gold border-amber-700",
  dropped: "bg-panel text-muted border-edge line-through",
};

export function StatusBadge({ status }: { status: CourseStatus }) {
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-xs ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export { SUBJECT_ICON };
