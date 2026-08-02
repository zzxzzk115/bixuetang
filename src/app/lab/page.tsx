import Link from "next/link";
import { LAB_IDS } from "@/lib/content/schema";
import { LABS } from "@/lib/labs";

export const metadata = { title: "实验室" };

export default function LabIndexPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">🧪 实验室</h1>
      <p className="mt-1 text-sm text-muted">
        光看视频不动手是学不会的——实验室把课程内容变成可以上手玩的东西。
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {LAB_IDS.map((id) => {
          const lab = LABS[id];
          return (
            <Link
              key={id}
              href={lab.href}
              className="rounded-lg border border-edge bg-panel p-6 transition-colors hover:border-gold hover:bg-panel-hover"
            >
              <div className="text-3xl">{lab.icon}</div>
              <h2 className="mt-2 font-bold">{lab.title}</h2>
              <p className="mt-1 text-sm text-muted">{lab.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
