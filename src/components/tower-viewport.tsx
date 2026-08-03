"use client";

import { useEffect, useRef } from "react";

export function TowerViewport({
  currentId,
  children,
}: {
  currentId: string | null;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const viewport = ref.current;
    if (!viewport) return;
    const target = currentId
      ? viewport.querySelector<HTMLElement>(`[data-course-id="${CSS.escape(currentId)}"]`)
      : viewport.querySelector<HTMLElement>("[data-tower-base]");
    target?.scrollIntoView({ block: "center", inline: "center" });
  }, [currentId]);

  return (
    <div ref={ref} className="tower-viewport">
      {children}
    </div>
  );
}
