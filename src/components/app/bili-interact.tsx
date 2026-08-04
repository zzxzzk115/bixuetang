"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CircleDollarSign,
  Link2,
  Loader2,
  MessageCircle,
  Star,
  ThumbsUp,
} from "lucide-react";
import {
  addCoin,
  getInteractState,
  loadReplies,
  sendReply,
  toggleFavorite,
  toggleLike,
  type InteractState,
} from "@/lib/bili/interact-actions";

// 视频互动区：点赞 / 投币 / 收藏 / 分享 / 评论。
// 全部是用户本人账号的显式单条操作；未绑定时按钮禁用并给出提示。

interface Reply {
  id: string;
  uname: string;
  avatar: string;
  message: string;
  like: number;
  time: number;
}

function fmtCount(n?: number): string {
  if (!n) return "";
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(n);
}

export function BiliInteract({
  bvid,
  aid,
  page,
}: {
  bvid: string;
  aid: number | null;
  page: number;
}) {
  const [state, setState] = useState<InteractState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [replies, setReplies] = useState<Reply[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getInteractState(bvid).then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, [bvid]);

  const bound = state?.bound ?? false;
  const rel = state?.relation;

  const run = async (key: string, fn: () => Promise<void>) => {
    if (busy || !bound) return;
    setBusy(key);
    setMsg(null);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const onLike = () =>
    run("like", async () => {
      const r = await toggleLike(bvid, !rel?.like);
      if (!r.ok) setMsg(r.error ?? "点赞失败");
      else setState((s) => (s ? { ...s, relation: r.relation } : s));
    });

  const onCoin = (multiply: number) =>
    run("coin", async () => {
      const r = await addCoin(bvid, multiply);
      if (!r.ok) setMsg(r.error ?? "投币失败");
      else {
        setState((s) => (s ? { ...s, relation: r.relation } : s));
        setMsg(`已投 ${multiply} 个币`);
      }
    });

  const onFav = () =>
    run("fav", async () => {
      if (aid === null) return;
      const r = await toggleFavorite(bvid, aid, !rel?.favorite);
      if (!r.ok) setMsg(r.error ?? "收藏失败");
      else setState((s) => (s ? { ...s, relation: r.relation } : s));
    });

  const onShare = async () => {
    const url = `https://www.bilibili.com/video/${bvid}${page > 1 ? `?p=${page}` : ""}`;
    try {
      await navigator.clipboard.writeText(url);
      setMsg("链接已复制");
    } catch {
      setMsg(url);
    }
  };

  const openReplies = async () => {
    if (replies !== null || aid === null) {
      setReplies(replies === null ? [] : null);
      return;
    }
    setBusy("reply");
    try {
      setReplies(await loadReplies(aid));
    } finally {
      setBusy(null);
    }
  };

  const onSend = async () => {
    if (aid === null || !draft.trim() || sending) return;
    setSending(true);
    setMsg(null);
    try {
      const r = await sendReply(aid, draft);
      if (!r.ok) {
        setMsg(r.error ?? "发送失败");
        return;
      }
      setDraft("");
      setMsg("评论已发送");
      setReplies(await loadReplies(aid));
    } finally {
      setSending(false);
    }
  };

  const disabledTitle = bound ? undefined : "绑定 B 站账号后可用";

  return (
    <div className="bili-interact">
      <div className="bili-interact-row">
        <button
          className={rel?.like ? "on" : undefined}
          onClick={onLike}
          disabled={!bound || busy !== null}
          title={disabledTitle}
        >
          {busy === "like" ? (
            <Loader2 size={17} className="spin" aria-hidden />
          ) : (
            <ThumbsUp size={17} fill={rel?.like ? "currentColor" : "none"} />
          )}
          <span>{rel?.like ? "已赞" : "点赞"}</span>
          {state?.stat?.like ? <em>{fmtCount(state.stat.like)}</em> : null}
        </button>

        <button
          className={rel?.coin ? "on" : undefined}
          onClick={() => onCoin(rel?.coin ? 1 : 2)}
          disabled={!bound || busy !== null || (rel?.coin ?? 0) >= 2}
          title={
            bound
              ? (rel?.coin ?? 0) >= 2
                ? "这个稿件已经投满 2 个币"
                : "投币（默认 2 个，已投过则再投 1 个）"
              : disabledTitle
          }
        >
          {busy === "coin" ? (
            <Loader2 size={17} className="spin" aria-hidden />
          ) : (
            <CircleDollarSign size={17} />
          )}
          <span>{rel?.coin ? `已投 ${rel.coin}` : "投币"}</span>
          {state?.stat?.coin ? <em>{fmtCount(state.stat.coin)}</em> : null}
        </button>

        <button
          className={rel?.favorite ? "on" : undefined}
          onClick={onFav}
          disabled={!bound || busy !== null || aid === null}
          title={disabledTitle}
        >
          {busy === "fav" ? (
            <Loader2 size={17} className="spin" aria-hidden />
          ) : (
            <Star size={17} fill={rel?.favorite ? "currentColor" : "none"} />
          )}
          <span>{rel?.favorite ? "已收藏" : "收藏"}</span>
          {state?.stat?.favorite ? <em>{fmtCount(state.stat.favorite)}</em> : null}
        </button>

        <button onClick={onShare} title="复制视频链接">
          <Link2 size={17} />
          <span>分享</span>
        </button>

        <button
          className={replies !== null ? "on" : undefined}
          onClick={openReplies}
          disabled={aid === null}
        >
          {busy === "reply" ? (
            <Loader2 size={17} className="spin" aria-hidden />
          ) : (
            <MessageCircle size={17} />
          )}
          <span>评论</span>
          {state?.stat?.reply ? <em>{fmtCount(state.stat.reply)}</em> : null}
        </button>
      </div>

      {!bound && (
        <p className="bili-interact-hint">
          点赞 / 投币 / 收藏 / 发评论需要 B 站账号，
          <Link href="/settings">去绑定 →</Link>
        </p>
      )}
      {msg && <p className="bili-interact-msg">{msg}</p>}

      {replies !== null && (
        <div className="bili-replies">
          {bound ? (
            <div className="bili-reply-compose">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="发条评论…（会以你的 B 站账号发布）"
                rows={2}
                maxLength={500}
              />
              <button
                className="app-btn-primary"
                onClick={onSend}
                disabled={sending || !draft.trim()}
              >
                {sending ? "发送中…" : "发送"}
              </button>
            </div>
          ) : (
            <p className="bili-interact-hint">绑定 B 站账号后可以发评论</p>
          )}

          {replies.length === 0 ? (
            <p className="bili-interact-hint">还没有评论</p>
          ) : (
            <ul className="bili-reply-list">
              {replies.map((r) => (
                <li key={r.id}>
                  {/* B 站头像是外部图源，用原生 img 避开 next/image 域名白名单 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.avatar} alt="" referrerPolicy="no-referrer" />
                  <div>
                    <b>{r.uname}</b>
                    <p>{r.message}</p>
                    <small>
                      {new Date(r.time * 1000).toLocaleDateString()} · {r.like} 赞
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
