import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import {
  ShopHome,
  type PotionSpecDto,
  type RelicDto,
} from "@/components/app/shop-home";
import { getCurrentUser } from "@/lib/auth/session";
import { POTIONS } from "@/lib/game/boosts";
import {
  RELIC_SHOP_PRICES,
  SLOT_PRICES,
  UPGRADE_CHANCE,
} from "@/lib/game/fusion";
import { getGameBootstrap } from "@/lib/game/bootstrap";
import { MAX_EQUIP_SLOTS } from "@/lib/game/relics";
import { FREEZE_PRICE, getStreak, MAX_FREEZES } from "@/lib/game/streak-server";

export const metadata = { title: "商店" };

export default async function ShopPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const bootstrap = getGameBootstrap(user);
  const specs: PotionSpecDto[] = Object.values(POTIONS).map((p) => ({
    kind: p.kind,
    title: p.title,
    badge: p.badge,
    multiplierPct: p.multiplierPct,
    episodes: p.episodes,
    price: p.price,
    bagPrice: p.bagPrice,
    blurb: p.blurb,
  }));

  const relics: RelicDto[] = bootstrap.rpg.relics.map((r) => ({
    id: r.id,
    title: r.title,
    rarity: r.rarity,
    subject: r.subject,
    quantity: r.quantity,
  }));

  return (
    <AppShell bootstrap={bootstrap}>
      <div className="app-page">
        <ShopHome
          bootstrap={bootstrap}
          specs={specs}
          freezePrice={FREEZE_PRICE}
          freezesOwned={getStreak(user.id).freezes}
          maxFreezes={MAX_FREEZES}
          relics={relics}
          equipSlots={bootstrap.rpg.equipSlots}
          maxEquipSlots={MAX_EQUIP_SLOTS}
          slotPrices={SLOT_PRICES}
          relicPrices={RELIC_SHOP_PRICES}
          fuseChances={{
            common: Math.round(UPGRADE_CHANCE.common * 100),
            uncommon: Math.round(UPGRADE_CHANCE.uncommon * 100),
            rare: Math.round(UPGRADE_CHANCE.rare * 100),
          }}
        />
      </div>
    </AppShell>
  );
}
