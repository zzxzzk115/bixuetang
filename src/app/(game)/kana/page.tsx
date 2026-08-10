import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Feather } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { KanaChart } from "@/components/app/kana-chart";
import { getCurrentUser } from "@/lib/auth/session";
import { getGameBootstrap } from "@/lib/game/bootstrap";

export const metadata = { title: "五十音图" };

export default async function KanaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const bootstrap = getGameBootstrap(user);

  return (
    <AppShell bootstrap={bootstrap}>
      <div className="app-page app-course">
        <header
          className="course-hero"
          style={{ background: "var(--app-purple)" }}
        >
          <div className="course-hero-tags">
            <span>日语</span>
            <span>入门第一课</span>
          </div>
          <h1>
            <Feather size={20} aria-hidden /> 五十音图
          </h1>
          <p>假名是日语的字母。点着听、跟着读,再用测验查漏——认全它,日语就入门了。</p>
        </header>

        <section className="course-card">
          <KanaChart />
        </section>

        <Link href="/roadmaps/language-master" className="kana-cta">
          <Feather size={18} aria-hidden />
          <span>
            <b>认得差不多了?</b>
            <small>进「成为语言大师」路线,按视频课系统学下去</small>
          </span>
          <ChevronRight size={20} aria-hidden />
        </Link>
      </div>
    </AppShell>
  );
}
