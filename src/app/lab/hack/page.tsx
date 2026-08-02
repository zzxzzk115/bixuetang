import { HackLabLoader } from "@/components/hack/hack-lab-loader";

export const metadata = { title: "Hack 实验室" };

export default function HackLabPage() {
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold">🔩 Hack 实验室</h1>
        <p className="mt-1 text-sm text-muted">
          Nand2Tetris 的浏览器移植：写 Hack 汇编或 Jack 语言，经
          Jack → VM → 汇编 → 机器码全链路编译后跑在模拟 CPU 上（OS 调用由
          CPU 级 trap 原生实现），512×256 屏幕由 WebGL 渲染。
          载入 Paddle.jack 试试方向键接球——点击屏幕获得焦点后操作。
        </p>
      </div>
      <HackLabLoader />
    </div>
  );
}
