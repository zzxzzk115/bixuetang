import { redirect } from "next/navigation";
import { Award, Lock } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { getCurrentUser } from "@/lib/auth/session";
import { getGameBootstrap } from "@/lib/game/bootstrap";
import { syncAchievements } from "@/lib/game/achievements";

export const metadata = { title: "成就收集" };

function dateStr(ms: number): string {
  return new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export default async function AchievementsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const bootstrap = getGameBootstrap(user);
  // 顺手检测并解锁达成的成就(幂等),新解锁的会落一条好友动态
  const achievements = syncAchievements(user.id);
  const got = achievements.filter((a) => a.unlocked).length;

  return (
    <AppShell bootstrap={bootstrap}>
      <div className="app-page">
        <header className="course-hero" style={{ background: "var(--app-gold)" }}>
          <div className="course-hero-tags">
            <span>收藏册</span>
            <span>
              {got}/{achievements.length}
            </span>
          </div>
          <h1>
            <Award size={20} aria-hidden /> 成就收集
          </h1>
          <p>完成课程、攒连胜、升段、认全假名……每达成一项,就点亮一枚。</p>
        </header>

        <section className="ach-grid">
          {achievements.map((a) => (
            <div key={a.id} className={`ach-card${a.unlocked ? " on" : ""}`}>
              <span className="ach-icon">
                {a.unlocked ? <Award size={22} aria-hidden /> : <Lock size={18} aria-hidden />}
              </span>
              <b>{a.title}</b>
              <small>{a.description}</small>
              {a.unlocked && a.unlockedAt && (
                <em className="ach-date">{dateStr(a.unlockedAt)} 解锁</em>
              )}
            </div>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
