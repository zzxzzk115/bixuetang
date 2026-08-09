"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import { submitRouteSuggestion } from "@/lib/game/goal-actions";

// 路线总览页的「没有想要的?告诉我们」入口:老用户也能反馈想要的职业路线。
// 只提交建议,不动用户当前目标(与新手引导里的 CareerOther 区别)。
export function RouteSuggest() {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <div className="route-suggest route-suggest-done">
        <CheckCircle2 size={20} aria-hidden />
        <span>已收到,谢谢!我们会考虑加进来。</span>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="route-suggest route-suggest-trigger"
        onClick={() => setOpen(true)}
      >
        <Sparkles size={18} aria-hidden />
        想成为其他?告诉我们 →
      </button>
    );
  }

  function submit() {
    startTransition(async () => {
      const r = await submitRouteSuggestion(text);
      if (!r.ok) {
        setErr(r.error ?? "提交失败,稍后再试");
        return;
      }
      setDone(true);
    });
  }

  return (
    <div className="route-suggest route-suggest-form">
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
          type="button"
          className="app-btn-plain"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          取消
        </button>
        <button
          type="button"
          className="app-btn-primary"
          onClick={submit}
          disabled={pending || !text.trim()}
        >
          提交
        </button>
      </div>
    </div>
  );
}
