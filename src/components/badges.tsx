import { BrainCircuit } from "lucide-react";
import { LEVEL_LABEL, SUBJECT_LABEL, type Level, type Subject } from "@/lib/content/schema";
import type { CourseStatus } from "@/lib/db/schema";

// 难度是有序的，所以除了颜色还要给一个能排序的视觉量：菱形个数。
// 只靠颜色的话，基础(绿) 与 进阶(青) 在小字号下几乎分不出来，
// 色觉障碍用户更是完全读不出高低。填充底色也拉开了，不再是清一色描边。
const LEVEL_STYLE: Record<Level, { cls: string; pips: number }> = {
  basic: {
    cls: "border-xp/70 bg-xp/12 text-xp",
    pips: 1,
  },
  intermediate: {
    cls: "border-mana/70 bg-mana/15 text-mana",
    pips: 2,
  },
  advanced: {
    cls: "border-hp/70 bg-hp/15 text-hp",
    pips: 3,
  },
};

export function LevelBadge({ level }: { level: Level }) {
  const { cls, pips } = LEVEL_STYLE[level];
  return (
    <span
      className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[12px] font-bold ${cls}`}
      title={`难度：${LEVEL_LABEL[level]}`}
    >
      <span aria-hidden className="font-mono tracking-tighter">
        {"◆".repeat(pips)}
        <span className="opacity-30">{"◆".repeat(3 - pips)}</span>
      </span>
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
    <span className="inline-flex items-center gap-1 font-mono text-[12px] text-muted">
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

// 同样不能只靠颜色：每个状态配一个形状不同的记号，
// 缩略到很小或黑白打印时仍然可辨。已讨伐用实心、攻略中用半填充、待命用空心。
const STATUS_STYLE: Record<CourseStatus, { cls: string; glyph: string }> = {
  planned: { cls: "border-edge bg-panel text-muted", glyph: "○" },
  learning: { cls: "border-mana bg-mana/15 text-mana", glyph: "◐" },
  done: { cls: "border-gold bg-gold/18 text-gold", glyph: "●" },
  dropped: {
    cls: "border-edge bg-panel text-muted line-through opacity-70",
    glyph: "×",
  },
};

export function StatusBadge({ status }: { status: CourseStatus }) {
  const { cls, glyph } = STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[12px] font-bold ${cls}`}
    >
      <span aria-hidden className="font-mono">
        {glyph}
      </span>
      {STATUS_LABEL[status]}
    </span>
  );
}
