import { HackLabLoader } from "@/components/hack/hack-lab-loader";

export const metadata = { title: "Hack 实验室" };

export default function HackLabPage() {
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold">🔩 Hack 实验室</h1>
        <p className="mt-1 text-sm text-muted">
          Nand2Tetris 的浏览器移植：在这里写 Hack 汇编（Jack 语言即将开放），
          编译后跑在模拟 CPU 上，512×256 的屏幕由 WebGL 渲染。
          试试载入 fill.asm——点击屏幕获得焦点后按住任意键。
        </p>
      </div>
      <HackLabLoader />
    </div>
  );
}
