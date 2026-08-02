"use client";

import { useState } from "react";
import type { HackMachine } from "@/lib/hack/cpu/machine";

const POINTERS: { label: string; addr: number }[] = [
  { label: "SP", addr: 0 },
  { label: "LCL", addr: 1 },
  { label: "ARG", addr: 2 },
  { label: "THIS", addr: 3 },
  { label: "THAT", addr: 4 },
];

function Cell({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded bg-panel-hover px-2 py-1 text-center">
      <div className="text-[10px] text-muted">{label}</div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}

export function HackRegisters({
  machineRef,
  tick,
}: {
  machineRef: React.RefObject<HackMachine | null>;
  tick: number;
}) {
  const [peekAddr, setPeekAddr] = useState("0");
  const m = machineRef.current;
  void tick; // tick 驱动重渲染

  if (!m) {
    return (
      <p className="text-xs text-muted">编译并载入程序后显示寄存器状态</p>
    );
  }

  const base = Math.max(0, Math.min(32760, parseInt(peekAddr, 10) || 0));

  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-4 gap-1.5">
        <Cell label="A" value={m.a} />
        <Cell label="D" value={m.d} />
        <Cell label="PC" value={m.pc} />
        <Cell label="cycles" value={m.cycles.toLocaleString()} />
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {POINTERS.map((p) => (
          <Cell key={p.label} label={p.label} value={m.ram[p.addr]} />
        ))}
      </div>
      <div>
        <div className="mb-1 flex items-center gap-2 text-xs text-muted">
          <span>RAM 窥视</span>
          <input
            value={peekAddr}
            onChange={(e) => setPeekAddr(e.target.value)}
            className="w-20 rounded border border-edge bg-background px-1.5 py-0.5 font-mono text-xs outline-none focus:border-gold"
            placeholder="地址"
          />
        </div>
        <div className="grid grid-cols-4 gap-1 font-mono text-xs">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="rounded bg-background px-1.5 py-0.5">
              <span className="text-muted">[{base + i}]</span> {m.ram[base + i]}
            </div>
          ))}
        </div>
      </div>
      {m.halted && (
        <p className="text-xs text-gold">⏹ 程序已停机（检测到收尾自旋）</p>
      )}
    </div>
  );
}
