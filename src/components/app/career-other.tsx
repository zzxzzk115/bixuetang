"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { suggestCareer } from "@/lib/game/goal-actions";

// 目标选择里的「其他（我想成为…）」:展开一个输入框,写下想成为的角色 →
// 存给运营考虑新增路线,并进入「暂时随便逛逛」。选/提交后由 onDone 收尾。

export function CareerOther({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        className="onboard-career onboard-career-other"
        onClick={() => setOpen(true)}
      >
        <span className="onboard-career-icon">
          <Sparkles size={26} aria-hidden />
        </span>
        <span className="onboard-career-body">
          <b>其他（我想成为…）</b>
          <small>告诉我们你的目标,我们考虑加进来;这期间先随便逛逛</small>
        </span>
      </button>
    );
  }

  function submit() {
    startTransition(async () => {
      const r = await suggestCareer(text);
      if (!r.ok) {
        setErr(r.error ?? "提交失败,稍后再试");
        return;
      }
      onDone();
    });
  }

  return (
    <div className="onboard-other-form">
      <input
        autoFocus
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setErr(null);
        }}
        maxLength={100}
        placeholder="例如:成为产品经理 / 硬件工程师 / 独立开发者"
        disabled={pending}
      />
      {err && <p className="bili-bind-error">{err}</p>}
      <div className="onboard-other-actions">
        <button
          className="app-btn-plain"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          取消
        </button>
        <button
          className="app-btn-primary"
          onClick={submit}
          disabled={pending || !text.trim()}
        >
          提交并随便逛逛
        </button>
      </div>
    </div>
  );
}
