"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createRoom } from "@/lib/social/study-actions";

// 新建自习室:起个名字 → 建好后直接进入。
export function CreateRoom() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const n = name.trim();
    if (!n) return;
    startTransition(async () => {
      const r = await createRoom(n);
      if (!r.ok || !r.id) {
        setErr(r.error ?? "创建失败,稍后再试");
        return;
      }
      router.push(`/study/${r.id}`);
    });
  }

  return (
    <div className="study-create">
      <input
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setErr(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        maxLength={20}
        placeholder="自习室名字(如:考研冲刺 / 每晚八点)"
      />
      <button
        className="app-btn-primary"
        onClick={submit}
        disabled={pending || !name.trim()}
      >
        <Plus size={15} aria-hidden /> 创建并进入
      </button>
      {err && <p className="bili-bind-error">{err}</p>}
    </div>
  );
}
