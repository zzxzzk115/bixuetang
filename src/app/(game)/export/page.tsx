import { redirect } from "next/navigation";
import { Boxes, Braces, Download, FileText, Layers } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { getCurrentUser } from "@/lib/auth/session";
import { getGameBootstrap } from "@/lib/game/bootstrap";
import { gatherExport } from "@/lib/export/gather";

export const metadata = { title: "导出与联动" };

export default async function ExportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const bootstrap = getGameBootstrap(user);
  const bundle = gatherExport(user.id);
  const noteCount = bundle.notes.length;
  const termCount = bundle.terms.length;

  const downloads = [
    {
      href: "/api/export?format=zip",
      icon: Boxes,
      title: "Obsidian 打包（.zip）",
      desc: "每门课一个 Markdown，带时间戳深链与术语 [[wikilink]]。解压拖进 Obsidian 库即用；Notion / Logseq 也能导入。",
      accent: "var(--app-purple)",
      disabled: noteCount === 0,
    },
    {
      href: "/api/export?format=md",
      icon: FileText,
      title: "单文件 Markdown（.md）",
      desc: "所有笔记合并成一个 .md，随手贴进任意笔记应用。",
      accent: "var(--app-blue)",
      disabled: noteCount === 0,
    },
    {
      href: "/api/export?format=anki",
      icon: Layers,
      title: "Anki 术语卡组（.tsv）",
      desc: "你学过课程的卷宗术语，正面词、背面释义，直接导入 Anki 背记。",
      accent: "var(--app-green)",
      disabled: termCount === 0,
    },
    {
      href: "/api/export?format=json",
      icon: Braces,
      title: "结构化数据（.json）",
      desc: "笔记与术语的原始 JSON，喂给自己的脚本或其它工具。",
      accent: "var(--app-teal)",
      disabled: noteCount === 0 && termCount === 0,
    },
  ];

  return (
    <AppShell bootstrap={bootstrap}>
      <div className="app-page export-page">
        <header className="course-hero" style={{ background: "var(--app-teal)" }}>
          <div className="course-hero-tags">
            <span>你的数据</span>
            <span>随时带走</span>
          </div>
          <h1>
            <Download size={20} aria-hidden /> 导出与联动
          </h1>
          <p>
            笔记 {noteCount} 条 · 术语 {termCount} 个。数据是你的，导出到 Obsidian / Anki
            或任何工具，随时带走。
          </p>
        </header>

        <section className="export-grid">
          {downloads.map((d) => {
            const Icon = d.icon;
            return d.disabled ? (
              <div key={d.href} className="export-card is-disabled">
                <span className="export-card-icon" style={{ background: d.accent }}>
                  <Icon size={20} aria-hidden />
                </span>
                <div className="export-card-body">
                  <b>{d.title}</b>
                  <small>{d.desc}</small>
                  <em className="export-empty">还没有可导出的内容</em>
                </div>
              </div>
            ) : (
              <a key={d.href} href={d.href} className="export-card" download>
                <span className="export-card-icon" style={{ background: d.accent }}>
                  <Icon size={20} aria-hidden />
                </span>
                <div className="export-card-body">
                  <b>{d.title}</b>
                  <small>{d.desc}</small>
                </div>
                <Download size={18} aria-hidden className="export-card-dl" />
              </a>
            );
          })}
        </section>
      </div>
    </AppShell>
  );
}
