"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FlaskRound,
  Heart,
  Lightbulb,
  Plus,
  ShoppingBag,
  Timer,
  Zap,
} from "lucide-react";
import type { GameBootstrap, RelicDto } from "@/lib/game/bootstrap-types";
import type { PotionKind } from "@/lib/game/boosts";
import { equipRelic, unequipRelic } from "@/lib/game/equipment-actions";
import { drinkPotion } from "@/lib/game/shop-actions";
import type { StatBlock } from "@/lib/game/relics";
import {
  EQUIP_SLOTS,
  STAT_LABEL,
  SUBJECT_STAT,
  relicBonus,
  type StatKey,
} from "@/lib/game/relics";
import { sessionPerks } from "@/lib/game/session-perks";
import { AppShell } from "./app-shell";

// 背包：装备栏（3 槽）+ 遗物网格 + 四维/道具效果面板。
// 交互两步走（移动端防误触）：先点遗物选中，再点槽位装备；
// 无选中时点已装备的槽位 = 卸下。装备立刻反映到四维与效果预览。

const RARITY_LABEL: Record<string, string> = {
  common: "普通",
  uncommon: "优秀",
  rare: "稀有",
  legendary: "传说",
};

const SUBJECT_COLOR: Record<string, string> = {
  cs: "var(--app-blue)",
  math: "var(--app-teal)",
  physics: "var(--app-orange)",
  ai: "var(--app-green)",
};

interface EquipVm {
  slot: number;
  itemId: string;
}

const POTION_LABEL: Record<PotionKind, { title: string; blurb: string }> = {
  x15: { title: "经验药水 ×1.5", blurb: "2 集内单集经验 ×1.5" },
  x3: { title: "浓缩经验药水 ×3", blurb: "4 集内单集经验 ×3" },
};

export function BagHome({
  bootstrap,
  potions: initialPotions,
}: {
  bootstrap: GameBootstrap;
  potions: Record<PotionKind, number>;
}) {
  const router = useRouter();
  const [potions, setPotions] = useState(initialPotions);
  const [boost, setBoost] = useState(bootstrap.boost);
  const [drinking, setDrinking] = useState(false);
  const relics = bootstrap.rpg.relics;
  const byId = useMemo(
    () => new Map(relics.map((r) => [r.id, r])),
    [relics],
  );
  const [equipped, setEquipped] = useState<EquipVm[]>(
    bootstrap.rpg.equipped.map((e) => ({ slot: e.slot, itemId: e.item.id })),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加成本地即算（与服务端同一套 relics.ts 纯函数），操作后无需等注水
  const bonus: StatBlock = useMemo(() => {
    const blocks = equipped
      .map((e) => byId.get(e.itemId))
      .filter((r): r is RelicDto => !!r)
      .map((r) => relicBonus(r, r.quantity));
    return blocks.reduce(
      (acc, b) => ({
        insight: acc.insight + b.insight,
        focus: acc.focus + b.focus,
        precision: acc.precision + b.precision,
        resolve: acc.resolve + b.resolve,
      }),
      { insight: 0, focus: 0, precision: 0, resolve: 0 },
    );
  }, [equipped, byId]);

  const base = bootstrap.rpg.baseStats;
  const total: StatBlock = {
    insight: base.insight + bonus.insight,
    focus: base.focus + bonus.focus,
    precision: base.precision + bonus.precision,
    resolve: base.resolve + bonus.resolve,
  };
  const perks = sessionPerks(total);
  const equippedIds = new Set(equipped.map((e) => e.itemId));

  const syncFromProfile = (
    profile: { equipped: { slot: number; item: { id: string } }[] } | undefined,
  ) => {
    if (!profile) return;
    setEquipped(profile.equipped.map((e) => ({ slot: e.slot, itemId: e.item.id })));
  };

  const onSlot = async (slot: number) => {
    if (busy) return;
    setError(null);
    const current = equipped.find((e) => e.slot === slot);
    setBusy(true);
    try {
      if (selectedId) {
        const r = await equipRelic(slot, selectedId);
        if (!r.ok) setError(r.error ?? "装备失败");
        else syncFromProfile(r.profile);
        setSelectedId(null);
      } else if (current) {
        const r = await unequipRelic(slot);
        if (!r.ok) setError(r.error ?? "卸下失败");
        else syncFromProfile(r.profile);
      }
    } finally {
      setBusy(false);
    }
  };

  const sorted = useMemo(() => {
    const order: Record<string, number> = {
      legendary: 0,
      rare: 1,
      uncommon: 2,
      common: 3,
    };
    return [...relics].sort(
      (a, b) => order[a.rarity] - order[b.rarity] || b.quantity - a.quantity,
    );
  }, [relics]);

  const drink = async (kind: PotionKind) => {
    if (drinking) return;
    setDrinking(true);
    try {
      const r = await drinkPotion(kind);
      if (r.ok) {
        setPotions(r.potions ?? potions);
        setBoost(r.boost ?? null);
        router.refresh(); // 顶栏加成徽章
      }
    } finally {
      setDrinking(false);
    }
  };

  const potionEntries = (Object.keys(POTION_LABEL) as PotionKind[]).filter(
    (k) => potions[k] > 0,
  );

  return (
    <AppShell bootstrap={bootstrap}>
      <div className="bag-root">
        <section className="bag-card">
          <div className="bag-card-head">
            <h2>消耗品</h2>
            <button
              className="bag-shop-link"
              onClick={() => router.push("/play/shop")}
            >
              <ShoppingBag size={15} aria-hidden /> 商店
            </button>
          </div>
          {boost && boost.episodesLeft > 0 && (
            <p className="bag-boost">
              <Zap size={15} aria-hidden /> 经验 ×{boost.multiplierPct / 100}{" "}
              生效中 · 还能加成 {boost.episodesLeft} 次(整集或章节)
            </p>
          )}
          {potionEntries.length === 0 ? (
            <p className="bag-tip">背包里没有药水——去商店逛逛</p>
          ) : (
            <div className="bag-potions">
              {potionEntries.map((k) => (
                <div key={k} className="bag-potion">
                  <span className="bag-potion-icon">
                    <FlaskRound size={22} aria-hidden />
                  </span>
                  <div className="bag-potion-body">
                    <b>{POTION_LABEL[k].title}</b>
                    <small>
                      {POTION_LABEL[k].blurb} · ×{potions[k]}
                    </small>
                  </div>
                  <button
                    className="app-btn-primary"
                    disabled={drinking}
                    onClick={() => drink(k)}
                  >
                    使用
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bag-card">
          <h2>装备栏</h2>
          <div className="bag-slots">
            {Array.from({ length: EQUIP_SLOTS }, (_, slot) => {
              const vm = equipped.find((e) => e.slot === slot);
              const relic = vm ? byId.get(vm.itemId) : undefined;
              const color = relic
                ? SUBJECT_COLOR[relic.subject]
                : "var(--app-line)";
              const stat = relic ? SUBJECT_STAT[relic.subject] : null;
              return (
                <button
                  key={slot}
                  className={`bag-slot rarity-${relic?.rarity ?? "empty"} ${selectedId ? "target" : ""}`}
                  style={relic ? { borderColor: color } : undefined}
                  onClick={() => onSlot(slot)}
                  disabled={busy}
                >
                  {relic ? (
                    <>
                      <b>{relic.title}</b>
                      <small style={{ color }}>
                        +{STAT_LABEL[stat as StatKey]}
                        {relicBonus(relic, relic.quantity)[stat as StatKey]}
                      </small>
                    </>
                  ) : (
                    <Plus size={22} aria-hidden />
                  )}
                </button>
              );
            })}
          </div>
          <p className="bag-tip">
            {selectedId
              ? "点一个槽位装备选中的遗物"
              : "点遗物选中，再点槽位装备；点已装备的槽位卸下"}
          </p>
          {error && <p className="bag-error">{error}</p>}
        </section>

        <section className="bag-card">
          <h2>四维 · 战力 {total.insight + total.focus + total.precision + total.resolve}</h2>
          <div className="bag-stats">
            {(Object.keys(STAT_LABEL) as StatKey[]).map((k) => (
              <span key={k}>
                <small>{STAT_LABEL[k]}</small>
                <b>
                  {total[k]}
                  {bonus[k] > 0 && <em>+{bonus[k]}</em>}
                </b>
              </span>
            ))}
          </div>
          <ul className="bag-perks">
            <li>
              <Timer size={16} aria-hidden /> 专注 → 每题限时 {perks.timeLimitSec}s
            </li>
            <li>
              <Lightbulb size={16} aria-hidden /> 洞察 → 排除提示 ×{perks.hints}
            </li>
            <li>
              <Zap size={16} aria-hidden /> 精准 → 快答窗口{" "}
              {Math.round(perks.fastRatio * 100)}%
            </li>
            <li>
              <Heart size={16} aria-hidden /> 意志 → 试炼生命 ×{perks.hearts}
            </li>
          </ul>
        </section>

        <section className="bag-card">
          <h2>遗物（{relics.length} 种）</h2>
          {relics.length === 0 ? (
            <p className="bag-tip">去地图看课，击败小怪就会掉落遗物</p>
          ) : (
            <div className="bag-grid">
              {sorted.map((r) => {
                const color = SUBJECT_COLOR[r.subject];
                const stat = SUBJECT_STAT[r.subject];
                const value = relicBonus(r, r.quantity)[stat];
                return (
                  <button
                    key={r.id}
                    className={`bag-relic rarity-${r.rarity} ${selectedId === r.id ? "selected" : ""} ${equippedIds.has(r.id) ? "equipped" : ""}`}
                    onClick={() =>
                      setSelectedId((cur) => (cur === r.id ? null : r.id))
                    }
                  >
                    <span className="bag-relic-rarity">
                      {RARITY_LABEL[r.rarity]}
                    </span>
                    <b>{r.title}</b>
                    <small>
                      ×{r.quantity} ·{" "}
                      <span style={{ color }}>
                        +{STAT_LABEL[stat]}
                        {value}
                      </span>
                    </small>
                    {equippedIds.has(r.id) && (
                      <span className="bag-relic-on">已装备</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
