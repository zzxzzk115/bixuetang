"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Backpack,
  Coins,
  FlaskRound,
  Gem,
  Grid2X2,
  Snowflake,
  Sparkles,
  Zap,
} from "lucide-react";
import type { GameBootstrap } from "@/lib/game/bootstrap-types";
import type { PotionKind } from "@/lib/game/boosts";
import type { Subject } from "@/lib/content/schema";
import {
  buyEquipSlot,
  buyPotion,
  buyRelic,
  buyStreakFreeze,
  fuseRelics,
  type ShopResult,
} from "@/lib/game/shop-actions";

// 商店：花金币买经验药水与连胜冻结。默认「立即生效」，想囤进背包要加价。
// 扩展柜台:装备槽扩容(3→6)、遗物直售(融合素材)、遗物融合(3 同稀有度
// 合 1,有几率升一级——变率强化的开箱时刻)。

const SUBJECT_LABEL_SHORT: Record<Subject, string> = {
  cs: "计算机",
  math: "数学",
  physics: "物理",
  ai: "AI",
};

const RARITY_LABEL: Record<string, string> = {
  common: "普通",
  uncommon: "优秀",
  rare: "稀有",
  legendary: "传说",
};

export interface RelicDto {
  id: string;
  title: string;
  rarity: string;
  subject: Subject;
  quantity: number;
}

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
  relics: initialRelics,
  equipSlots: initialSlots,
  maxEquipSlots,
  slotPrices,
  relicPrices,
  fuseChances,
}: {
  bootstrap: GameBootstrap;
  specs: PotionSpecDto[];
  freezePrice: number;
  freezesOwned: number;
  maxFreezes: number;
  /** 持有的遗物(融合素材选择用) */
  relics: RelicDto[];
  equipSlots: number;
  maxEquipSlots: number;
  /** 购买后槽数 → 价格 */
  slotPrices: Record<number, number>;
  /** 直售遗物价格 */
  relicPrices: Record<"common" | "uncommon", number>;
  /** 各稀有度融合升级概率(×100 展示) */
  fuseChances: Record<string, number>;
}) {
  const router = useRouter();
  const [coins, setCoins] = useState(bootstrap.rpg.coins);
  const [boost, setBoost] = useState(bootstrap.boost);
  const [freezes, setFreezes] = useState(freezesOwned);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [relics, setRelics] = useState(initialRelics);
  const [slots, setSlots] = useState(initialSlots);
  /** 融合选中的素材(itemId 可重复,最多 3 个) */
  const [picked, setPicked] = useState<string[]>([]);
  const [fuseMsg, setFuseMsg] = useState<string | null>(null);

  const pickedRarity =
    picked.length > 0
      ? relics.find((r) => r.id === picked[0])?.rarity
      : undefined;

  const togglePick = (id: string) => {
    setFuseMsg(null);
    const count = picked.filter((p) => p === id).length;
    const owned = relics.find((r) => r.id === id)?.quantity ?? 0;
    if (count < owned && picked.length < 3) {
      // 还能再塞同款且没满 3 个 → 追加;否则视为取消该款全部
      const rarity = relics.find((r) => r.id === id)?.rarity;
      if (picked.length > 0 && rarity !== pickedRarity) {
        setFuseMsg("三件素材的稀有度必须相同");
        return;
      }
      setPicked([...picked, id]);
    } else {
      setPicked(picked.filter((p) => p !== id));
    }
  };

  const onBuySlot = async () => {
    if (busy) return;
    setBusy("slot");
    setMsg(null);
    try {
      const r = await buyEquipSlot();
      if (!r.ok) {
        setMsg(r.error ?? "购买失败");
        return;
      }
      setCoins(r.coins ?? coins);
      setSlots(r.equipSlots ?? slots + 1);
      setMsg("装备槽 +1!去背包把它填上");
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const onBuyRelic = async (subject: Subject, rarity: "common" | "uncommon") => {
    if (busy) return;
    setBusy(`relic:${subject}:${rarity}`);
    setMsg(null);
    try {
      const r = await buyRelic(subject, rarity);
      if (!r.ok || !r.item) {
        setMsg(r.error ?? "购买失败");
        return;
      }
      setCoins(r.coins ?? coins);
      setRelics((cur) => {
        const hit = cur.find((x) => x.id === r.item!.id);
        if (hit) {
          return cur.map((x) =>
            x.id === r.item!.id ? { ...x, quantity: x.quantity + 1 } : x,
          );
        }
        return [
          ...cur,
          {
            id: r.item!.id,
            title: r.item!.title,
            rarity: r.item!.rarity,
            subject: r.item!.subject,
            quantity: 1,
          },
        ];
      });
      setMsg(`「${r.item.title}」已入包`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const onFuse = async () => {
    if (busy || picked.length !== 3) return;
    setBusy("fuse");
    setFuseMsg(null);
    try {
      const r = await fuseRelics(picked);
      if (!r.ok || !r.item) {
        setFuseMsg(r.error ?? "融合失败");
        return;
      }
      // 本地扣素材、加产物
      setRelics((cur) => {
        const need = new Map<string, number>();
        for (const id of picked) need.set(id, (need.get(id) ?? 0) + 1);
        let next = cur
          .map((x) =>
            need.has(x.id)
              ? { ...x, quantity: x.quantity - need.get(x.id)! }
              : x,
          )
          .filter((x) => x.quantity > 0);
        const hit = next.find((x) => x.id === r.item!.id);
        if (hit) {
          next = next.map((x) =>
            x.id === r.item!.id ? { ...x, quantity: x.quantity + 1 } : x,
          );
        } else {
          next = [
            ...next,
            {
              id: r.item!.id,
              title: r.item!.title,
              rarity: r.item!.rarity,
              subject: r.item!.subject,
              quantity: 1,
            },
          ];
        }
        return next;
      });
      setPicked([]);
      setFuseMsg(
        r.upgraded
          ? `✨ 升级了!融出「${r.item.title}」(${RARITY_LABEL[r.item.rarity]})`
          : `融出「${r.item.title}」(${RARITY_LABEL[r.item.rarity]})`,
      );
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

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

      {/* 装备槽扩容:默认 3 格,买到 6 格 */}
      <section className="shop-card potion-slot">
        <span className="shop-card-icon shop-card-icon-slot">
          <Grid2X2 size={30} strokeWidth={2.2} />
        </span>
        <div className="shop-card-body">
          <h2>装备槽扩容</h2>
          <p>
            当前 {slots}/{maxEquipSlots} 格。多一格就多装一件遗物,四维直接见涨。
          </p>
          <div className="shop-card-actions">
            <button
              className="app-btn-primary"
              disabled={
                busy !== null ||
                slots >= maxEquipSlots ||
                coins < (slotPrices[slots + 1] ?? Infinity)
              }
              onClick={onBuySlot}
            >
              <Grid2X2 size={15} aria-hidden />
              {slots >= maxEquipSlots
                ? "已满配"
                : `扩到 ${slots + 1} 格 · ${slotPrices[slots + 1]}`}
            </button>
          </div>
        </div>
      </section>

      {/* 遗物直售:融合素材,高稀有度不卖 */}
      <section className="shop-card potion-relic">
        <span className="shop-card-icon shop-card-icon-relic">
          <Gem size={30} strokeWidth={2.2} />
        </span>
        <div className="shop-card-body">
          <h2>遗物小卖部</h2>
          <p>
            只卖普通({relicPrices.common})与优秀({relicPrices.uncommon}
            )品阶的遗物当融合素材——稀有与传说,得自己学出来。
          </p>
          <div className="shop-relic-grid">
            {(Object.keys(SUBJECT_LABEL_SHORT) as Subject[]).map((s) => (
              <div key={s} className="shop-relic-cell">
                <b>{SUBJECT_LABEL_SHORT[s]}</b>
                <button
                  className="app-btn-plain"
                  disabled={busy !== null || coins < relicPrices.common}
                  onClick={() => onBuyRelic(s, "common")}
                >
                  普通 · {relicPrices.common}
                </button>
                <button
                  className="app-btn-plain"
                  disabled={busy !== null || coins < relicPrices.uncommon}
                  onClick={() => onBuyRelic(s, "uncommon")}
                >
                  优秀 · {relicPrices.uncommon}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 遗物融合:3 同稀有度 → 1,几率升级 */}
      <section className="shop-card potion-fuse">
        <span className="shop-card-icon shop-card-icon-fuse">
          <Sparkles size={30} strokeWidth={2.2} />
        </span>
        <div className="shop-card-body">
          <h2>遗物融合</h2>
          <p>
            挑 3 件同稀有度遗物融成 1 件,升级概率:普通{" "}
            {fuseChances.common}% / 优秀 {fuseChances.uncommon}% / 稀有{" "}
            {fuseChances.rare}%;产物学科随机继承自素材。传说融合只重掷学科。
          </p>
          {relics.length === 0 ? (
            <p className="shop-fuse-empty">背包里还没有遗物——先去学习攒一点</p>
          ) : (
            <div className="shop-fuse-grid">
              {relics.map((r) => {
                const count = picked.filter((p) => p === r.id).length;
                const disabled =
                  picked.length > 0 && r.rarity !== pickedRarity && count === 0;
                return (
                  <button
                    key={r.id}
                    className={`shop-fuse-chip rarity-${r.rarity} ${count > 0 ? "on" : ""} ${disabled ? "dim" : ""}`}
                    onClick={() => togglePick(r.id)}
                    title={`${r.title} · ${RARITY_LABEL[r.rarity]} · 持有 ${r.quantity}`}
                  >
                    <span>{r.title}</span>
                    <small>
                      {RARITY_LABEL[r.rarity]} ×{r.quantity}
                      {count > 0 ? ` · 已选 ${count}` : ""}
                    </small>
                  </button>
                );
              })}
            </div>
          )}
          {fuseMsg && <p className="shop-fuse-msg">{fuseMsg}</p>}
          <div className="shop-card-actions">
            <button
              className="app-btn-primary"
              disabled={busy !== null || picked.length !== 3}
              onClick={onFuse}
            >
              <Sparkles size={15} aria-hidden /> 融合({picked.length}/3)
            </button>
            {picked.length > 0 && (
              <button
                className="app-btn-plain"
                onClick={() => {
                  setPicked([]);
                  setFuseMsg(null);
                }}
              >
                清空
              </button>
            )}
          </div>
        </div>
      </section>

      <p className="shop-note">
        药水按「次结算」计数(整集或章节),长视频也不会中途失效。
        加成只作用于观看经验(测验 / 宝箱 / 试炼另计);
        同倍率重复购买累加次数,不同倍率会替换。金币不受加成影响。
        连胜冻结只在「断一天」时生效——躺平太久是救不回来的。
        融合消耗的遗物不可找回,升级与否听天由命。
      </p>
    </div>
  );
}
