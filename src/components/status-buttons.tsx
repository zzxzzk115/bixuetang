"use client";

import { useState, useTransition } from "react";
import type { CourseStatus } from "@/lib/db/schema";
import { setCourseStatus } from "@/lib/progress/actions";
import { STATUS_LABEL } from "./badges";

const ORDER: CourseStatus[] = ["planned", "learning", "done", "dropped"];

export function StatusButtons({ courseId, current, loggedIn }: {
  courseId: string;
  current: CourseStatus | null;
  loggedIn: boolean;
}) {
  const [status, setStatus] = useState<CourseStatus | null>(current);
  const [, startTransition] = useTransition();
  if (!loggedIn) return null;

  return (
    <div className="inline-flex border border-edge bg-background p-1">
      {ORDER.map((item) => (
        <button
          key={item}
          onClick={() => {
            setStatus(item);
            startTransition(async () => {
              const result = await setCourseStatus(courseId, item);
              if (!result.ok) setStatus(current);
            });
          }}
          className={`border px-2.5 py-1 font-mono text-[12px] font-bold uppercase transition-colors ${
            status === item
              ? "border-gold bg-panel-strong text-gold"
              : "border-transparent bg-transparent text-muted hover:border-edge hover:text-foreground"
          }`}
        >
          {STATUS_LABEL[item]}
        </button>
      ))}
    </div>
  );
}
