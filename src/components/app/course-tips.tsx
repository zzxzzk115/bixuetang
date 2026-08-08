"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { deleteCourseTip, postCourseTip } from "@/lib/game/tips-actions";

// 课程学习心得(UGC):过来人留短评,别人看得到。发布走敏感词过滤;只能删自己的。
interface Tip {
  id: number;
  userId: number;
  name: string;
  avatar: string | null;
  text: string;
  createdAt: number;
  isOwn: boolean;
}

function fmt(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function CourseTips({
  courseId,
  initial,
}: {
  courseId: string;
  initial: Tip[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const t = text.trim();
    if (!t) return;
    startTransition(async () => {
      const r = await postCourseTip(courseId, t);
      if (!r.ok) {
        setErr(r.error ?? "发送失败,稍后再试");
        return;
      }
      setText("");
      router.refresh();
    });
  }
  function del(id: number) {
    startTransition(async () => {
      await deleteCourseTip(id);
      router.refresh();
    });
  }

  return (
    <div className="tips">
      <div className="tips-compose">
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setErr(null);
          }}
          maxLength={300}
          rows={2}
          placeholder="留一句学习心得:先看哪几集、配合什么练习、哪里容易卡…"
        />
        <div className="tips-compose-foot">
          {err ? (
            <span className="bili-bind-error">{err}</span>
          ) : (
            <span className="tips-count">{text.length}/300</span>
          )}
          <button
            className="app-btn-primary"
            onClick={submit}
            disabled={pending || !text.trim()}
          >
            <MessageSquarePlus size={15} aria-hidden /> 发布
          </button>
        </div>
      </div>

      {initial.length === 0 ? (
        <p className="me-note">还没有心得。你的第一条,能帮到后来的人。</p>
      ) : (
        <ul className="tips-list">
          {initial.map((t) => (
            <li key={t.id} className="tip">
              <UserAvatar
                userId={t.userId}
                avatar={t.avatar}
                name={t.name}
                size={34}
              />
              <div className="tip-body">
                <div className="tip-head">
                  <b>{t.name}</b>
                  <small>{fmt(t.createdAt)}</small>
                  {t.isOwn && (
                    <button
                      className="tip-del"
                      onClick={() => del(t.id)}
                      disabled={pending}
                      aria-label="删除"
                    >
                      <Trash2 size={13} aria-hidden />
                    </button>
                  )}
                </div>
                <p>{t.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
