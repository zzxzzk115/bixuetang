import { redirect } from "next/navigation";
import {
  Award,
  BookOpen,
  Clock,
  Flame,
  Layers,
  Medal,
  NotebookPen,
  Play,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { AchievementClaim } from "@/components/app/achievement-claim";
import { getCurrentUser } from "@/lib/auth/session";
import { getGameBootstrap } from "@/lib/game/bootstrap";
import { syncAchievements, type TrackView } from "@/lib/game/achievements";

export const metadata = { title: "成就收集" };

function TrackIcon({ icon }: { icon: string }) {
  const p = { size: 22, "aria-hidden": true } as const;
  switch (icon) {
    case "play":
      return <Play {...p} />;
    case "trophy":
      return <Trophy {...p} />;
    case "flame":
      return <Flame {...p} />;
    case "pen":
      return <NotebookPen {...p} />;
    case "book":
      return <BookOpen {...p} />;
    case "trending":
      return <TrendingUp {...p} />;
    case "clock":
      return <Clock {...p} />;
    case "layers":
      return <Layers {...p} />;
    case "medal":
      return <Medal {...p} />;
    case "users":
      return <Users {...p} />;
    default:
      return <Award {...p} />;
  }
}

function TrackCard({ track }: { track: TrackView }) {
  const reached = track.reachedIdx >= 0 ? track.tiers[track.reachedIdx] : null;
  const tone = reached ? `var(${reached.colorVar})` : "var(--app-faint)";
  const hasUnclaimed = track.tiers.some((t) => t.unlocked && !t.claimed);
  // 到下一级的进度(已满级则满格)
  const prevNeed = track.reachedIdx >= 0 ? track.tiers[track.reachedIdx].need : 0;
  const pct =
    track.nextNeed == null
      ? 100
      : Math.max(
          0,
          Math.min(100, ((track.value - prevNeed) / (track.nextNeed - prevNeed)) * 100),
        );

  return (
    <div className={`track-card${reached ? " on" : ""}`}>
      <span className="track-icon" style={{ background: tone }}>
        <TrackIcon icon={track.icon} />
      </span>
      <div className="track-body">
        <div className="track-head">
          <b>{track.title}</b>
          {hasUnclaimed ? (
            <span className="track-claim-dot">待领取</span>
          ) : (
            <span className="track-tier" style={{ color: tone }}>
              {reached ? reached.label : "未开始"}
            </span>
          )}
        </div>
        <div className="track-pips">
          {track.tiers.map((tier, i) => (
            <span
              key={i}
              className={`track-pip${tier.unlocked ? " on" : ""}`}
              style={tier.unlocked ? { background: `var(${tier.colorVar})` } : undefined}
              title={`${tier.label}级 · ${tier.desc}`}
            >
              {tier.label}
            </span>
          ))}
        </div>
        <div className="track-bar">
          <i style={{ width: `${pct}%`, background: tone }} />
        </div>
        <small className="track-progress">
          {track.value}
          {track.unit}
          {track.nextNeed != null
            ? ` · 距 ${track.tiers[track.reachedIdx + 1].label} 还差 ${track.nextNeed - track.value}`
            : " · 已满级 🎉"}
        </small>
      </div>
    </div>
  );
}

export default async function AchievementsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const bootstrap = getGameBootstrap(user);
  // 顺手检测并解锁达成的等级(幂等),新达成的会落一条好友动态
  const { tracks } = syncAchievements(user.id);
  const gotTiers = tracks.reduce((s, t) => s + t.tiers.filter((x) => x.unlocked).length, 0);
  const totalTiers = tracks.reduce((s, t) => s + t.tiers.length, 0);
  const unclaimed = tracks.flatMap((t) => t.tiers).filter((x) => x.unlocked && !x.claimed);
  const claimCoins = unclaimed.reduce((s, x) => s + x.reward, 0);

  return (
    <AppShell bootstrap={bootstrap}>
      <div className="app-page">
        <header className="course-hero" style={{ background: "var(--app-gold)" }}>
          <div className="course-hero-tags">
            <span>收藏册</span>
            <span>
              {gotTiers}/{totalTiers} 枚
            </span>
          </div>
          <h1>
            <Award size={20} aria-hidden /> 成就收集
          </h1>
          <p>每条成就都能一路升级:Lv.1 → Lv.5。达成新等级,记得回来领金币。</p>
        </header>

        {unclaimed.length > 0 && (
          <AchievementClaim count={unclaimed.length} coins={claimCoins} />
        )}

        <section className="track-grid">
          {tracks.map((track) => (
            <TrackCard key={track.id} track={track} />
          ))}
        </section>
      </div>
    </AppShell>
  );
}
