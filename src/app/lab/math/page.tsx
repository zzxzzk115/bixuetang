import { MathLabLoader } from "@/components/math/math-lab-loader";

export const metadata = { title: "数学工坊" };

export default async function MathLabPage({
  searchParams,
}: {
  searchParams: Promise<{ expr?: string }>;
}) {
  const { expr } = await searchParams;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold">⚗️ 数学工坊</h1>
        <p className="mt-1 text-sm text-muted">
          交互式公式演算：求值、化简、符号求导、函数图像。
          全部在浏览器本地计算（MathLive + Compute Engine），无需联网。
        </p>
      </div>
      <MathLabLoader initialExpr={expr} />
    </div>
  );
}
