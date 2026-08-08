"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Search, Share2, UserPlus } from "lucide-react";
import {
  followUser,
  searchUsers,
  type SearchRow,
} from "@/lib/social/actions";
import { InviteSharePopup } from "./invite-share-popup";
import { UserAvatar } from "@/components/user-avatar";

/** 邀请链接:本站源 + /login?reg=1&ref=<我>。localhost 开发用局域网地址 */
function useInviteLink(viewerId: number): string {
  const [link, setLink] = useState("");
  useEffect(() => {
    const lan = document.documentElement.dataset.lanOrigin;
    const origin =
      lan && /^(localhost|127\.)/.test(window.location.hostname)
        ? lan
        : window.location.origin;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLink(`${origin}/login?reg=1&ref=${viewerId}`);
  }, [viewerId]);
  return link;
}

// 邀请卡:复制链接(不显示原文)或生成带二维码的邀请图分享,复用分享图逻辑。
export function InviteCard({
  viewerId,
  viewerName,
  invited,
}: {
  viewerId: number;
  viewerName: string;
  invited: number;
}) {
  const link = useInviteLink(viewerId);
  const [msg, setMsg] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  function flash(t: string) {
    setMsg(t);
    setTimeout(() => setMsg(null), 2200);
  }
  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      flash("邀请链接已复制,发给好友吧");
    } catch {
      flash("复制失败,稍后再试");
    }
  }

  return (
    <section className="invite-card">
      <div className="invite-card-head">
        <b>邀请好友一起学</b>
        <span>已邀请 {invited} 人</span>
      </div>
      <p className="me-note">
        好友经你的邀请注册后自动互相关注;等 TA 完成新手引导,你得 +50 XP、+100 金币。
      </p>
      <div className="invite-card-actions">
        <button
          className="app-btn-primary"
          onClick={() => setShareOpen(true)}
          disabled={!link}
        >
          <Share2 size={15} aria-hidden /> 分享邀请图
        </button>
        <button className="app-btn-plain" onClick={() => void copy()}>
          <Copy size={15} aria-hidden /> 复制链接
        </button>
      </div>
      {msg && <p className="invite-card-msg">{msg}</p>}
      {shareOpen && link && (
        <InviteSharePopup
          onClose={() => setShareOpen(false)}
          inviterName={viewerName}
          link={link}
        />
      )}
    </section>
  );
}

// 加好友:按用户名/昵称搜人,一键关注(关注后进你的好友榜)。
export function AddFriend() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<SearchRow[] | null>(null);
  const [pending, startTransition] = useTransition();

  function doSearch() {
    const query = q.trim();
    if (!query) return;
    startTransition(async () => {
      setRows(await searchUsers(query));
    });
  }
  function follow(id: number) {
    startTransition(async () => {
      const r = await followUser(id);
      if (r.ok) {
        setRows((rs) =>
          rs ? rs.map((x) => (x.id === id ? { ...x, followed: true } : x)) : rs,
        );
        router.refresh();
      }
    });
  }

  return (
    <div className="add-friend">
      <div className="add-friend-bar">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
          maxLength={32}
          placeholder="搜用户名或昵称"
        />
        <button
          className="app-btn-plain"
          onClick={doSearch}
          disabled={pending || !q.trim()}
        >
          <Search size={15} aria-hidden /> 搜索
        </button>
      </div>
      {rows && rows.length === 0 && (
        <p className="me-note">没找到这个人,换个名字试试。</p>
      )}
      {rows && rows.length > 0 && (
        <ul className="add-friend-list">
          {rows.map((r) => (
            <li key={r.id}>
              <UserAvatar
                userId={r.id}
                avatar={r.avatar}
                name={r.name}
                size={32}
              />
              <b>{r.name}</b>
              {r.followed ? (
                <span className="add-friend-done">
                  <Check size={14} aria-hidden /> 已关注
                </span>
              ) : (
                <button
                  className="add-friend-btn"
                  disabled={pending}
                  onClick={() => follow(r.id)}
                >
                  <UserPlus size={14} aria-hidden /> 关注
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
