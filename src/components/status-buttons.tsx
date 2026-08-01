"use client";

import { useState, useTransition } from "react";
import type { CourseStatus } from "@/lib/db/schema";
import { setCourseStatus } from "@/lib/progress/actions";
import { STATUS_LABEL } from "./badges";

const ORDER: CourseStatus[] = ["planned", "learning", "done", "dropped"];

export function StatusButtons({
  courseId,
  current,
  loggedIn,
}: {
  courseId: string;
  current: CourseStatus | null;
  loggedIn: boolean;
}) {
  const [status, setStatus] = useState<CourseStatus | null>(current);
  const [, startTransition] = useTransition();

  if (!loggedIn) return null;

  return (
    <div className="flex gap-1.5">
      {ORDER.map((s) => (
        <button
          key={s}
          onClick={() => {
            setStatus(s);
            startTransition(async () => {
              const res = await setCourseStatus(courseId, s);
              if (!res.ok) setStatus(current);
            });
          }}
          className={`rounded border px-2.5 py-1 text-xs transition-colors ${
            status === s
              ? "border-gold bg-amber-950 text-gold"
              : "border-edge bg-panel text-muted hover:text-foreground"
          }`}
        >
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}
