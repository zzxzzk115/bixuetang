import { redirect } from "next/navigation";
import { BookOpen, Clock, Flame, GraduationCap, NotebookPen, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { JourneyShare } from "@/components/app/journey-share";
import { getCurrentUser } from "@/lib/auth/session";
import { getGameBootstrap } from "@/lib/game/bootstrap";
import { getJourney } from "@/lib/game/journey";
import { parseAvatar } from "@/lib/avatar/presets";

export const metadata = { title: "学习足迹" };

const SUBJECT_TONE_VAR: Record<string, string> = {
  cs: "--app-blue",
  math: "--app-teal",
  physics: "--app-orange",
  ai: "--app-green",
  en: "--app-pink",
  ja: "--app-purple",
  history: "--app-brown",
  research: "--app-gold",
  politics: "--app-red",
};

function hoursText(min: number): string {
  if (min < 60) return `${min} 分钟`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
}

export default async function JourneyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const bootstrap = getGameBootstrap(user);
  const j = getJourney(user.id);
  // canvas 画头像要同源:bilibili 头像走代理,上传头像走 /avatars/,预设/无则留空画首字母
  const av = parseAvatar(user.avatar);
  const shareAvatar =
    av.kind === "remote"
      ? `/api/avatar/${user.id}`
      : av.kind === "upload"
        ? `/avatars/${user.id}?v=${av.version}`
        : null;

  const maxEp = Math.max(1, ...j.subjects.map((s) => s.episodes));
  const stats = [
    { icon: Clock, label: "累计专注", value: hoursText(j.focusMinutes), tone: "var(--app-blue)" },
    { icon: BookOpen, label: "看过", value: `${j.episodesWatched} 集`, tone: "var(--app-green)" },
    { icon: NotebookPen, label: "记下", value: `${j.notes} 条笔记`, tone: "var(--app-purple)" },
    { icon: Sparkles, label: "认得", value: `${j.terms} 个术语`, tone: "var(--app-gold)" },
    { icon: Flame, label: "最长连胜", value: `${j.streakBest} 天`, tone: "var(--app-orange)" },
    {
      icon: GraduationCap,
      label: "修过课程",
      value: `${j.coursesStarted} 门`,
      tone: "var(--app-teal)",
    },
  ];

  return (
    <AppShell bootstrap={bootstrap}>
      <div className="app-page journey">
        <header className="course-hero" style={{ background: "var(--app-purple)" }}>
          <div className="course-hero-tags">
            <span>{j.name}</span>
            <span>自 {j.joinedDay}</span>
          </div>
          <h1>
            <Sparkles size={20} aria-hidden /> 你的学习足迹
          </h1>
          <p>
            你已经在这里活跃了 {j.activeDays} 天、攒下 {j.totalXp.toLocaleString()} 点经验，
            到了 Lv.{j.level}。每一步都算数——为你骄傲。
          </p>
          <JourneyShare
            name={j.name}
            avatarUrl={shareAvatar}
            subtitle={`自 ${j.joinedDay} · Lv.${j.level}`}
            stats={[
              { value: hoursText(j.focusMinutes), label: "累计专注" },
              { value: `${j.episodesWatched}`, label: "看过(集)" },
              { value: `${j.notes}`, label: "笔记(条)" },
              { value: `${j.terms}`, label: "术语(个)" },
              { value: `${j.streakBest}`, label: "最长连胜(天)" },
              { value: `${j.activeDays}`, label: "活跃(天)" },
            ]}
          />
        </header>

        <section className="journey-grid">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="journey-stat">
                <span className="journey-stat-icon" style={{ background: s.tone }}>
                  <Icon size={18} aria-hidden />
                </span>
                <b>{s.value}</b>
                <small>{s.label}</small>
              </div>
            );
          })}
        </section>

        {j.subjects.length > 0 && (
          <section className="course-card journey-subjects">
            <div className="course-card-head">
              <h2>学科足迹</h2>
            </div>
            <div className="journey-bars">
              {j.subjects.map((s) => (
                <div key={s.subject} className="journey-bar">
                  <span className="journey-bar-label">{s.label}</span>
                  <span className="journey-bar-track">
                    <i
                      style={{
                        width: `${Math.round((s.episodes / maxEp) * 100)}%`,
                        background: `var(${SUBJECT_TONE_VAR[s.subject] ?? "--app-blue"})`,
                      }}
                    />
                  </span>
                  <span className="journey-bar-num">{s.episodes} 集</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {j.coursesCompleted > 0 && (
          <p className="journey-note">
            <GraduationCap size={15} aria-hidden /> 其中 {j.coursesCompleted} 门已经学完 ——
            这可不容易，慢慢来，你一直在往前走。
          </p>
        )}
      </div>
    </AppShell>
  );
}
