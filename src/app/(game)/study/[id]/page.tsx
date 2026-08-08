import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { StudyRoom } from "@/components/app/study-room";
import { getCurrentUser } from "@/lib/auth/session";
import { getGameBootstrap } from "@/lib/game/bootstrap";
import { getRoom } from "@/lib/social/study";

export const metadata = { title: "自习室" };
export const dynamic = "force-dynamic";

export default async function StudyRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const rid = Number(id);
  const room = Number.isInteger(rid) ? getRoom(rid) : null;
  if (!room) notFound();

  const bootstrap = getGameBootstrap(user);
  return (
    <AppShell bootstrap={bootstrap}>
      <div className="app-page">
        <StudyRoom initial={room} />
      </div>
    </AppShell>
  );
}
