import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { ShopHome, type PotionSpecDto } from "@/components/app/shop-home";
import { getCurrentUser } from "@/lib/auth/session";
import { POTIONS } from "@/lib/game/boosts";
import { getGameBootstrap } from "@/lib/game/bootstrap";

export const metadata = { title: "商店" };

export default async function ShopPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const bootstrap = getGameBootstrap(user);
  const specs: PotionSpecDto[] = Object.values(POTIONS).map((p) => ({
    kind: p.kind,
    title: p.title,
    multiplierPct: p.multiplierPct,
    durationMs: p.durationMs,
    price: p.price,
    bagPrice: p.bagPrice,
    blurb: p.blurb,
  }));

  return (
    <AppShell bootstrap={bootstrap}>
      <div className="app-page">
        <ShopHome bootstrap={bootstrap} specs={specs} />
      </div>
    </AppShell>
  );
}
