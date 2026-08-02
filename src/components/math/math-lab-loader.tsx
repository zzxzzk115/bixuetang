"use client";

import dynamic from "next/dynamic";

const MathLab = dynamic(() => import("./math-lab").then((m) => m.MathLab), {
  ssr: false,
  loading: () => (
    <p className="py-20 text-center text-sm text-muted">工坊加载中……</p>
  ),
});

export function MathLabLoader({ initialExpr }: { initialExpr?: string }) {
  return <MathLab initialExpr={initialExpr} />;
}
