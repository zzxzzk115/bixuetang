"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Backpack, Coins, FlaskRound, Zap } from "lucide-react";
import type { GameBootstrap } from "@/lib/game/bootstrap-types";
import type { PotionKind } from "@/lib/game/boosts";
import { buyPotion, type ShopResult } from "@/lib/game/shop-actions";

// 商店：花金币买经验药水。默认「立即生效」，想囤进背包要加价。

export interface PotionSpecDto {
  kind: PotionKind;
  title: string;
  multiplierPct: number;
  durationMs: number;
  price: number;
  bagPrice: number;
  blurb: string;
}

function fmtRemaining(expiresAt: number, now: number): string {
  const min = Math.max(0, Math.round((expiresAt - now) / 60000));
  return `${min} 分钟`;
}

export function ShopHome({
  bootstrap,
  specs,
}: {
  bootstrap: GameBootstrap;
  specs: PotionSpecDto[];
}) {
  const router = useRouter();
  // 渲染期不许 Date.now()：用可更新的时刻快照算剩余时间
  const [now, setNow] = useState(() => Date.now());
  const [coins, setCoins] = useState(bootstrap.rpg.coins);
  const [boost, setBoost] = useState(bootstrap.boost);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

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
      setNow(Date.now());
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
          经验 ×{boost.multiplierPct / 100} 生效中 · 剩余{" "}
          {fmtRemaining(boost.expiresAt, now)}
        </div>
      )}
      {msg && <p className="shop-msg">{msg}</p>}

      {specs.map((p) => (
        <section key={p.kind} className={`shop-card potion-${p.kind}`}>
          <span className="shop-card-icon">
            <FlaskRound size={30} strokeWidth={2.2} />
          </span>
          <div className="shop-card-body">
            <h2>{p.title}</h2>
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

      <p className="shop-note">
        药水生效期间，看课 / 测验 / 宝箱 / 试炼 / 首胜的 XP 全部按倍率结算；
        同倍率重复购买会顺延时长，不同倍率会替换。金币不受加成影响。
      </p>
    </div>
  );
}
