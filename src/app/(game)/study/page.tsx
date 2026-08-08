import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app/app-shell";
import { CreateRoom } from "@/components/app/study-tools";
import { getCurrentUser } from "@/lib/auth/session";
import { getGameBootstrap } from "@/lib/game/bootstrap";
import { getRooms } from "@/lib/social/study";

export const metadata = { title: "自习室" };
export const dynamic = "force-dynamic";

// 每间房一个柔和主题色,循环取
const ROOM_TONES = [
  "var(--app-purple, #ce82ff)",
  "var(--app-blue)",
  "var(--app-orange)",
  "var(--app-teal)",
  "var(--app-pink)",
  "var(--app-green)",
];

export default async function StudyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const bootstrap = getGameBootstrap(user);
  const rooms = getRooms();

  return (
    <AppShell bootstrap={bootstrap}>
      <div className="app-page study-page">
        <header className="app-page-head">
          <h1>自习室</h1>
          <p className="me-note">
            进一间自习室,和同学一起安静学习、互相监督——有人陪着更学得下去。
          </p>
        </header>

        <div className="study-room-grid">
          {rooms.map((r, i) => (
            <Link
              key={r.id}
              href={`/study/${r.id}`}
              className="study-room-card"
              style={{ ["--tone" as string]: ROOM_TONES[i % ROOM_TONES.length] }}
            >
              <span className="study-room-emoji">{r.emoji ?? "📚"}</span>
              <b>{r.name}</b>
              {r.count > 0 ? (
                <span className="study-room-live on">
                  <i className="live-dot" aria-hidden /> {r.count} 人在学
                </span>
              ) : (
                <span className="study-room-live">空着 · 进来坐坐</span>
              )}
            </Link>
          ))}
        </div>

        <section className="course-card">
          <div className="course-card-head">
            <h2>新建自习室</h2>
          </div>
          <CreateRoom />
        </section>
      </div>
    </AppShell>
  );
}
