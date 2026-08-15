import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { MistakeBook } from "@/components/app/mistake-book";
import { getCurrentUser } from "@/lib/auth/session";
import { getGameBootstrap } from "@/lib/game/bootstrap";
import { drawMistakeDrill, listMistakes } from "@/lib/game/mistakes";

export const metadata = { title: "错题本" };
export const dynamic = "force-dynamic";

export default async function MistakesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const bootstrap = getGameBootstrap(user);
  const list = listMistakes(user.id);
  // seed 在 lib 里内联时间;交卷(resolveMistake)据此复现核对答案
  const { seed, cards } = drawMistakeDrill(user.id, 20);

  return (
    <AppShell bootstrap={bootstrap}>
      <MistakeBook list={list} drill={cards} seed={seed} />
    </AppShell>
  );
}
