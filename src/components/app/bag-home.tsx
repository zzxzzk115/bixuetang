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
import type { PotionKind, TimedPotionKind } from "@/lib/game/boosts";
import { equipRelic, unequipRelic } from "@/lib/game/equipment-actions";
import { drinkPotion, drinkTimedPotion } from "@/lib/game/shop-actions";
import type { StatBlock } from "@/lib/game/relics";
import {
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
  en: "var(--app-pink)",
};

interface EquipVm {
  slot: number;
  itemId: string;
}

const POTION_LABEL: Record<
  PotionKind,
  { title: string; badge: string; blurb: string }
> = {
  x15: {
    title: "经验药水",
    badge: "XP ×1.5",
    blurb: "6 次结算(整集或章节)经验 ×1.5",
  },
  x3: {
    title: "浓缩经验药水",
    badge: "XP ×3",
    blurb: "12 次结算(整集或章节)经验 ×3",
  },
};

const TIMED_LABEL: Record<
  TimedPotionKind,
  { title: string; badge: string; blurb: string }
> = {
  t30: {
    title: "急速经验药水",
    badge: "XP ×2",
    blurb: "30 分钟内一切学习所得经验 ×2(全局)",
  },
  t60: {
    title: "悠长经验药水",
    badge: "XP ×1.5",
    blurb: "60 分钟内一切学习所得经验 ×1.5(全局)",
  },
};

export function BagHome({
  bootstrap,
  potions: initialPotions,
  timedPotions: initialTimed,
}: {
  bootstrap: GameBootstrap;
  potions: Record<PotionKind, number>;
  timedPotions: Record<TimedPotionKind, number>;
}) {
  const router = useRouter();
  const [potions, setPotions] = useState(initialPotions);
  const [timedPotions, setTimedPotions] = useState(initialTimed);
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

  const drinkTimed = async (kind: TimedPotionKind) => {
    if (drinking) return;
    setDrinking(true);
    try {
      const r = await drinkTimedPotion(kind);
      if (r.ok) {
        setTimedPotions(r.timedPotions ?? timedPotions);
        router.refresh();
      }
    } finally {
      setDrinking(false);
    }
  };

  const potionEntries = (Object.keys(POTION_LABEL) as PotionKind[]).filter(
    (k) => potions[k] > 0,
  );
  const timedEntries = (Object.keys(TIMED_LABEL) as TimedPotionKind[]).filter(
    (k) => timedPotions[k] > 0,
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
          {bootstrap.timedBoost && bootstrap.timedBoost.secondsLeft > 0 && (
            <p className="bag-boost">
              <Timer size={15} aria-hidden /> 全局经验 ×
              {bootstrap.timedBoost.multiplierPct / 100} 生效中 · 剩{" "}
              {Math.ceil(bootstrap.timedBoost.secondsLeft / 60)} 分钟
            </p>
          )}
          {potionEntries.length === 0 && timedEntries.length === 0 ? (
            <p className="bag-tip">背包里没有药水——去商店逛逛</p>
          ) : (
            <div className="bag-potions">
              {potionEntries.map((k) => (
                <div key={k} className="bag-potion">
                  <span className="bag-potion-icon">
                    <FlaskRound size={22} aria-hidden />
                  </span>
                  <div className="bag-potion-body">
                    <b>
                      {POTION_LABEL[k].title}{" "}
                      <span className="xp-badge">{POTION_LABEL[k].badge}</span>
                    </b>
                    <small>
                      {POTION_LABEL[k].blurb} · 持有 {potions[k]} 瓶
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
              {timedEntries.map((k) => (
                <div key={k} className="bag-potion">
                  <span className="bag-potion-icon bag-potion-icon-timed">
                    <Timer size={22} aria-hidden />
                  </span>
                  <div className="bag-potion-body">
                    <b>
                      {TIMED_LABEL[k].title}{" "}
                      <span className="xp-badge">{TIMED_LABEL[k].badge}</span>
                    </b>
                    <small>
                      {TIMED_LABEL[k].blurb} · 持有 {timedPotions[k]} 瓶
                    </small>
                  </div>
                  <button
                    className="app-btn-primary"
                    disabled={drinking}
                    onClick={() => drinkTimed(k)}
                  >
                    使用
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bag-card">
          <h2>
            装备栏
            <small className="bag-slots-note">
              {bootstrap.rpg.equipSlots}/6 格
              {bootstrap.rpg.equipSlots < 6 ? " · 商店可扩容" : ""}
            </small>
          </h2>
          <div className="bag-slots">
            {Array.from({ length: bootstrap.rpg.equipSlots }, (_, slot) => {
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
            {(Object.keys(STAT_LABEL) as StatKey[]).map((k) => {
              const base = total[k] - bonus[k];
              return (
                <span key={k}>
                  <small>{STAT_LABEL[k]}</small>
                  <b>{total[k]}</b>
                  {/* 构成:基础值 + 装备增益(绿)/减益(红) */}
                  <i className="bag-stat-break">
                    {base}
                    {bonus[k] !== 0 && (
                      <em className={bonus[k] > 0 ? "up" : "down"}>
                        {bonus[k] > 0 ? "+" : ""}
                        {bonus[k]}
                      </em>
                    )}
                  </i>
                </span>
              );
            })}
          </div>
          <p className="bag-stats-note">数值 = 学习积累的基础 + 装备增益(绿)/减益(红)</p>
          <ul className="bag-perks">
            <li>
              <Timer size={16} aria-hidden />
              <span>
                <b>专注 {total.focus}</b> → 每题限时 {perks.timeLimitSec}s
                <small>基础 15s,每点专注 +0.5s,封顶 40s</small>
              </span>
            </li>
            <li>
              <Lightbulb size={16} aria-hidden />
              <span>
                <b>洞察 {total.insight}</b> → 排除提示 ×{perks.hints}
                <small>每 10 点洞察 +1 次,封顶 3 次</small>
              </span>
            </li>
            <li>
              <Zap size={16} aria-hidden />
              <span>
                <b>精准 {total.precision}</b> → 快答窗口{" "}
                {Math.round(perks.fastRatio * 100)}%
                <small>限时前这么多比例内答对算快答(有额外经验)</small>
              </span>
            </li>
            <li>
              <Heart size={16} aria-hidden />
              <span>
                <b>意志 {total.resolve}</b> → 试炼生命 {perks.hearts} 心
                <small>基础 3 心,每 15 点意志 +1、每 5 级 +1,封顶 8</small>
              </span>
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
                const b = relicBonus(r, r.quantity);
                // 诅咒遗物有两项非零(主属性增益 + 惩罚属性负增益)
                const deltas = (Object.keys(STAT_LABEL) as StatKey[])
                  .filter((k) => b[k] !== 0)
                  .map((k) => ({ k, v: b[k] }));
                return (
                  <button
                    key={r.id}
                    className={`bag-relic rarity-${r.rarity} ${r.cursed ? "cursed" : ""} ${selectedId === r.id ? "selected" : ""} ${equippedIds.has(r.id) ? "equipped" : ""}`}
                    onClick={() =>
                      setSelectedId((cur) => (cur === r.id ? null : r.id))
                    }
                  >
                    <span className="bag-relic-rarity">
                      {r.cursed ? "诅咒" : RARITY_LABEL[r.rarity]}
                    </span>
                    <b>{r.title}</b>
                    <small>
                      ×{r.quantity} ·{" "}
                      {deltas.map((d, i) => (
                        <span
                          key={d.k}
                          style={{ color: d.v > 0 ? color : "#e5484d" }}
                        >
                          {i > 0 ? " " : ""}
                          {d.v > 0 ? "+" : ""}
                          {d.v}
                          {STAT_LABEL[d.k]}
                        </span>
                      ))}
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
