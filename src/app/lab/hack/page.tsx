import Link from "next/link";
import { HackLabLoader } from "@/components/hack/hack-lab-loader";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { getLabTasksDone } from "@/lib/progress/queries";

export const metadata = { title: "Hack 实验室" };

export default async function HackLabPage() {
  const user = await getCurrentUser();
  const tasks = getContent().labTasksById.get("hack")?.tasks ?? [];
  const done = user ? getLabTasksDone(user.id, "hack") : new Set<string>();

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-64 flex-1">
          <h1 className="text-2xl font-bold">🔩 Hack 实验室</h1>
          <p className="mt-1 text-sm text-muted">
            Nand2Tetris（
            <Link href="/courses/nand2tetris" className="text-gold hover:underline">
              课程页
            </Link>
            ）的浏览器移植：写 Hack 汇编或 Jack 语言，经 Jack → VM → 汇编 →
            机器码全链路编译后跑在模拟 CPU 上（OS 调用由 CPU 级 trap 原生实现），
            512×256 屏幕由 WebGL 渲染。载入 Paddle.jack
            试试方向键接球——点击屏幕获得焦点后操作。
          </p>
        </div>
        {tasks.length > 0 && (
          <div className="rounded-lg border border-edge bg-panel p-3 text-sm">
            <div className="mb-1.5 text-xs font-bold text-muted">🏅 实验室成就</div>
            <ul className="space-y-1">
              {tasks.map((t) => (
                <li key={t.id} className={done.has(t.id) ? "text-gold" : "text-muted"}>
                  {done.has(t.id) ? "✅" : "⬜"} {t.title}
                  <span className="ml-1 text-xs">+{t.xp} XP</span>
                </li>
              ))}
            </ul>
            {!user && (
              <p className="mt-1.5 text-xs text-muted">
                <Link href="/login" className="text-gold underline">
                  登录
                </Link>
                后自动记录
              </p>
            )}
          </div>
        )}
      </div>
      <HackLabLoader />
    </div>
  );
}
