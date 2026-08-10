"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Crown, Minus, Shield, Trophy } from "lucide-react";
import { ackLeagueResult } from "@/lib/game/league-actions";
import type { LeagueOverview } from "@/lib/game/league-server";

// 段位联赛面板:结算横幅(弹一次)+ 段位卡 + 本周联赛榜(晋级/降级区着色)。
// 段位 = 本周获得经验的多邻国式周赛升降段结果,规则见 lib/game/league.ts。

function daysLeft(seasonEnd: number): number {
  return Math.max(0, Math.ceil((seasonEnd - Date.now()) / 86400000));
}

export function LeaguePanel({ overview }: { overview: LeagueOverview }) {
  const [dismissed, setDismissed] = useState(false);
  const [, startTransition] = useTransition();
  const {
    tierLabel,
    tierColorVar,
    weekXp,
    myRank,
    cohortSize,
    promoteCount,
    demoteCount,
    seasonEnd,
    board,
    pending,
  } = overview;

  const tone = `var(${tierColorVar})`;
  const left = daysLeft(seasonEnd);

  // 我此刻处于哪个区(晋级/降级/保级)
  const myZone = board.find((r) => r.me)?.zone ?? "hold";
  const statusText =
    promoteCount > 0 && myZone === "promote"
      ? "在晋级区 · 稳住就升段"
      : myZone === "demote"
        ? "在降级区 · 加把劲别掉段"
        : weekXp === 0
          ? "本周还没得分 · 去学一集攒经验"
          : "暂时安全 · 冲一冲晋级区";

  const ackBanner = () => {
    setDismissed(true);
    startTransition(() => {
      void ackLeagueResult();
    });
  };

  return (
    <section className="league">
      {pending && !dismissed && (
        <div className={`league-banner ${pending.result}`} role="status">
          <span className="league-banner-icon" aria-hidden>
            {pending.result === "promote" ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </span>
          <div className="league-banner-body">
            {pending.result === "promote" ? (
              <b>晋级到「{pending.toLabel}联赛」!</b>
            ) : (
              <b>掉到「{pending.toLabel}联赛」了</b>
            )}
            <small>
              上赛季从 {pending.fromLabel} {pending.result === "promote" ? "升到" : "降到"}{" "}
              {pending.toLabel} · 本周继续加油
            </small>
          </div>
          <button className="league-banner-x" onClick={ackBanner} aria-label="知道了">
            知道了
          </button>
        </div>
      )}

      <div className="league-card">
        <span className="league-badge" style={{ background: tone }}>
          {overview.tierIndex >= 7 ? (
            <Crown size={24} aria-hidden />
          ) : (
            <Trophy size={22} aria-hidden />
          )}
        </span>
        <div className="league-card-body">
          <div className="league-card-head">
            <b style={{ color: tone }}>{tierLabel}联赛</b>
            <span className="league-season">赛季还剩 {left} 天</span>
          </div>
          <div className="league-card-stats">
            <span>
              本周经验 <b>{weekXp}</b>
            </span>
            <span>
              排名 <b>{myRank}</b>/{cohortSize}
            </span>
          </div>
          <p className="league-status">{statusText}</p>
        </div>
      </div>

      <div className="league-zonehint">
        {promoteCount > 0 && (
          <span className="promote">
            <ChevronUp size={13} aria-hidden /> 前 {promoteCount} 名晋级
          </span>
        )}
        {demoteCount > 0 && (
          <span className="demote">
            <ChevronDown size={13} aria-hidden /> 后 {demoteCount} 名降级
          </span>
        )}
      </div>

      <ol className="league-board">
        {board.map((r) => (
          <li key={r.rank} className={`${r.zone}${r.me ? " me" : ""}`}>
            <span className="league-rank">{r.rank}</span>
            <span className="league-zonemark" aria-hidden>
              {r.zone === "promote" ? (
                <ChevronUp size={14} />
              ) : r.zone === "demote" ? (
                <ChevronDown size={14} />
              ) : (
                <Minus size={12} />
              )}
            </span>
            <span className="league-name">
              {r.name}
              {r.me && <em>（我）</em>}
            </span>
            <b className="league-xp">{r.weekXp}</b>
          </li>
        ))}
      </ol>
      {cohortSize <= 1 && (
        <p className="league-lonely">
          <Shield size={14} aria-hidden /> 同段位暂时只有你 · 拉朋友一起卷,榜才热闹
        </p>
      )}
    </section>
  );
}
