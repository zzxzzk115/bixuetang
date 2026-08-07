"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Backpack, Coins, FlaskRound, Snowflake, Zap } from "lucide-react";
import type { GameBootstrap } from "@/lib/game/bootstrap-types";
import type { PotionKind } from "@/lib/game/boosts";
import {
  buyPotion,
  buyStreakFreeze,
  type ShopResult,
} from "@/lib/game/shop-actions";

// 商店：花金币买经验药水与连胜冻结。默认「立即生效」，想囤进背包要加价。

export interface PotionSpecDto {
  kind: PotionKind;
  title: string;
  /** 倍率徽章(XP ×1.5)——放名字里会被读成「1.5 瓶」 */
  badge: string;
  multiplierPct: number;
  /** 覆盖多少次结算(整集或章节) */
  episodes: number;
  price: number;
  bagPrice: number;
  blurb: string;
}

export function ShopHome({
  bootstrap,
  specs,
  freezePrice,
  freezesOwned,
  maxFreezes,
}: {
  bootstrap: GameBootstrap;
  specs: PotionSpecDto[];
  freezePrice: number;
  freezesOwned: number;
  maxFreezes: number;
}) {
  const router = useRouter();
  const [coins, setCoins] = useState(bootstrap.rpg.coins);
  const [boost, setBoost] = useState(bootstrap.boost);
  const [freezes, setFreezes] = useState(freezesOwned);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const onBuyFreeze = async () => {
    if (busy) return;
    setBusy("freeze");
    setMsg(null);
    try {
      const r = await buyStreakFreeze();
      if (!r.ok) {
        setMsg(r.error ?? "购买失败");
        return;
      }
      setCoins(r.coins ?? coins);
      setFreezes(r.freezes ?? freezes + 1);
      setMsg("连胜冻结已入库,断档一天会自动消耗");
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const onBuy = async (kind: PotionKind, toBag: boolean) => {
    if (busy) return;
    setBusy(`${kind}:${toBag}`);
    setMsg(null);
    try {
      const r: ShopResult = await buyPotion(kind, toBag);
      if (!r.ok) {
        setMsg(r.error ?? "购买失败");
        return;
      }
      setCoins(r.coins ?? coins);
      setBoost(r.boost ?? null);
      setMsg(toBag ? "已放入背包" : "药水生效中！");
      router.refresh(); // 顶栏金币/加成徽章刷新
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="shop-root">
      <header className="shop-head">
        <h1>商店</h1>
        <span className="shop-coins">
          <Coins size={18} aria-hidden />
          {coins}
        </span>
      </header>

      {boost && (
        <div className="shop-active">
          <Zap size={18} aria-hidden />
          经验 ×{boost.multiplierPct / 100} 生效中 · 还能加成 {boost.episodesLeft}{" "}
          次(整集或章节)
        </div>
      )}
      {msg && <p className="shop-msg">{msg}</p>}

      {specs.map((p) => (
        <section key={p.kind} className={`shop-card potion-${p.kind}`}>
          <span className="shop-card-icon">
            <FlaskRound size={30} strokeWidth={2.2} />
          </span>
          <div className="shop-card-body">
            <h2>
              {p.title} <span className="xp-badge">{p.badge}</span>
            </h2>
            <p>{p.blurb}</p>
            <div className="shop-card-actions">
              <button
                className="app-btn-primary"
                disabled={busy !== null || coins < p.price}
                onClick={() => onBuy(p.kind, false)}
              >
                <Zap size={15} aria-hidden /> 立即使用 · {p.price}
              </button>
              <button
                className="app-btn-plain"
                disabled={busy !== null || coins < p.bagPrice}
                onClick={() => onBuy(p.kind, true)}
                title="囤进背包，想用时再喝"
              >
                <Backpack size={15} aria-hidden /> 放入背包 · {p.bagPrice}
              </button>
            </div>
          </div>
        </section>
      ))}

      <section className="shop-card potion-freeze">
        <span className="shop-card-icon shop-card-icon-freeze">
          <Snowflake size={30} strokeWidth={2.2} />
        </span>
        <div className="shop-card-body">
          <h2>连胜冻结</h2>
          <p>
            哪天实在没空学,冻结会自动顶上,连胜不清零。持有 {freezes}/
            {maxFreezes} 枚。
          </p>
          <div className="shop-card-actions">
            <button
              className="app-btn-primary"
              disabled={busy !== null || coins < freezePrice || freezes >= maxFreezes}
              onClick={onBuyFreeze}
            >
              <Snowflake size={15} aria-hidden />
              {freezes >= maxFreezes ? "已囤满" : `购买 · ${freezePrice}`}
            </button>
          </div>
        </div>
      </section>

      <p className="shop-note">
        药水按「集」计数：每完成一集消耗一次加成，长视频也不会中途失效。
        加成只作用于看完单集的经验（测验 / 宝箱 / 试炼另计）；
        同倍率重复购买累加集数，不同倍率会替换。金币不受加成影响。
        连胜冻结只在「断一天」时生效——躺平太久是救不回来的。
      </p>
    </div>
  );
}
