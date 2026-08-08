import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Crown, Users } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { AddFriend, InviteCard } from "@/components/app/social-tools";
import { UserAvatar } from "@/components/user-avatar";
import { getCurrentUser } from "@/lib/auth/session";
import { getGameBootstrap } from "@/lib/game/bootstrap";
import { getFriendLeaderboard, getSocialStats } from "@/lib/social/queries";

export const metadata = { title: "好友" };
export const dynamic = "force-dynamic";

export default async function SocialPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const bootstrap = getGameBootstrap(user);
  const board = getFriendLeaderboard(user.id);
  const stats = getSocialStats(user.id);

  return (
    <AppShell bootstrap={bootstrap}>
      <div className="app-page">
        <header className="app-page-head">
          <h1>好友</h1>
          <p className="me-note">和朋友一起学,互相较劲更有动力。</p>
        </header>

        <InviteCard
          viewerId={user.id}
          viewerName={user.displayName || user.username}
          viewerAvatar={user.avatar}
          invited={stats.invited}
        />

        <Link href="/study" className="study-entry">
          <span className="study-entry-icon" aria-hidden>
            <Users size={20} />
          </span>
          <span className="study-entry-body">
            <b>自习室</b>
            <small>和同学一起自习,互相监督更学得下去</small>
          </span>
          <ChevronRight size={18} aria-hidden />
        </Link>

        <section className="course-card">
          <div className="course-card-head">
            <h2>好友榜 · {board.length}</h2>
          </div>
          {board.length <= 1 ? (
            <p className="me-note">
              还没有好友。用上面的邀请链接拉朋友进来,或在下面搜人关注,
              一起上榜比学习。
            </p>
          ) : null}
          <ol className="friend-board">
            {board.map((f, i) => (
              <li
                key={f.userId}
                className={`friend-row${f.isSelf ? " is-self" : ""}`}
              >
                <span className={`friend-rank rank-${i + 1}`}>
                  {i === 0 ? <Crown size={15} aria-hidden /> : i + 1}
                </span>
                <UserAvatar
                  userId={f.userId}
                  avatar={f.avatar}
                  name={f.name}
                  size={38}
                />
                <div className="friend-main">
                  <b>
                    {f.name}
                    {f.isSelf ? " · 你" : ""}
                  </b>
                  <small>
                    Lv.{f.level} · {f.rankLabel}
                  </small>
                </div>
                <span className="friend-xp">
                  {f.totalXp.toLocaleString()} XP
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="course-card">
          <div className="course-card-head">
            <h2>加好友</h2>
          </div>
          <AddFriend />
        </section>
      </div>
    </AppShell>
  );
}
