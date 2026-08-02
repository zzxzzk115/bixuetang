"use client";

import { useEffect, useRef } from "react";

/** 只读公式展示：复用 math-field 的渲染管线，无需额外样式表 */
export function StaticMath({ latex }: { latex: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    void import("mathlive").then(({ MathfieldElement }) => {
      if (disposed || !host) return;
      host.innerHTML = "";
      const mf = new MathfieldElement();
      mf.readOnly = true;
      mf.value = latex;
      mf.style.border = "none";
      mf.style.background = "transparent";
      mf.style.fontSize = "1.05rem";
      host.appendChild(mf);
    });
    return () => {
      disposed = true;
    };
  }, [latex]);

  return <div ref={hostRef} className="min-h-6 overflow-x-auto" />;
}
