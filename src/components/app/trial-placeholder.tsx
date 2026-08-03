"use client";

import { Swords } from "lucide-react";
import type { GameBootstrap } from "@/lib/game/bootstrap-types";
import { AppShell } from "./app-shell";

export function TrialPlaceholder({ bootstrap }: { bootstrap: GameBootstrap }) {
  return (
    <AppShell bootstrap={bootstrap}>
      <div className="app-empty">
        <span className="app-empty-icon">
          <Swords size={44} strokeWidth={2} />
        </span>
        <h1>试炼场 · 即将开放</h1>
        <p>
          挑战按学科分层的虚拟敌人：它们抛出术语与知识点问题，
          答对造成伤害、答错自己掉血——检验你当前的能力能打到第几层。
        </p>
      </div>
    </AppShell>
  );
}
