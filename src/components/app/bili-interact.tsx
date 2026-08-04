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
  applyFavorite,
  getFavFolders,
  getInteractState,
  loadReplies,
  sendReply,
  toggleLike,
  type InteractState,
} from "@/lib/bili/interact-actions";

interface FavFolderVm {
  id: number;
  title: string;
  mediaCount: number;
  faved: boolean;
}

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
  /** 投币确认弹层（投币不可撤销，必须先确认） */
  const [coinAsk, setCoinAsk] = useState(false);
  /** 收藏夹面板：null=未打开 */
  const [folders, setFolders] = useState<FavFolderVm[] | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());

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

  const onCoin = (multiply: number) => {
    setCoinAsk(false);
    return run("coin", async () => {
      const r = await addCoin(bvid, multiply);
      if (!r.ok) setMsg(r.error ?? "投币失败");
      else {
        setState((s) => (s ? { ...s, relation: r.relation } : s));
        setMsg(`已投 ${multiply} 个币`);
      }
    });
  };

  // 打开收藏夹面板：拉列表并把已收的夹子预勾上
  const openFav = () =>
    run("fav", async () => {
      if (aid === null) return;
      if (folders !== null) {
        setFolders(null);
        return;
      }
      const r = await getFavFolders(aid);
      if (!r.ok || !r.folders) {
        setMsg(r.error ?? "取收藏夹失败");
        return;
      }
      setFolders(r.folders);
      setChecked(new Set(r.folders.filter((f) => f.faved).map((f) => f.id)));
    });

  const submitFav = () =>
    run("favApply", async () => {
      if (aid === null || folders === null) return;
      const before = new Set(folders.filter((f) => f.faved).map((f) => f.id));
      const addIds = [...checked].filter((id) => !before.has(id));
      const delIds = [...before].filter((id) => !checked.has(id));
      const r = await applyFavorite(bvid, aid, addIds, delIds);
      if (!r.ok) {
        setMsg(r.error ?? "收藏失败");
        return;
      }
      setState((s) => (s ? { ...s, relation: r.relation } : s));
      setFolders(null);
      setMsg(
        checked.size === 0
          ? "已从收藏夹移出"
          : `已收藏到 ${checked.size} 个收藏夹`,
      );
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
          onClick={() => setCoinAsk((v) => !v)}
          disabled={!bound || busy !== null || (rel?.coin ?? 0) >= 2}
          title={
            bound
              ? (rel?.coin ?? 0) >= 2
                ? "已投满 2 个币（投币不可撤销）"
                : "投币不可撤销，点开确认"
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
          onClick={openFav}
          disabled={!bound || busy !== null || aid === null}
          title={bound ? "选择收藏夹" : disabledTitle}
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

      {coinAsk && (
        <div className="bili-pop">
          <b>投几个币？</b>
          <p>投币会消耗你的硬币，且 B 站不支持撤销。</p>
          <div className="bili-pop-actions">
            <button className="app-btn-plain" onClick={() => onCoin(1)}>
              投 1 个
            </button>
            {(rel?.coin ?? 0) === 0 && (
              <button className="app-btn-primary" onClick={() => onCoin(2)}>
                投 2 个
              </button>
            )}
            <button className="bili-pop-cancel" onClick={() => setCoinAsk(false)}>
              取消
            </button>
          </div>
        </div>
      )}

      {folders !== null && (
        <div className="bili-pop">
          <b>收藏到</b>
          {folders.length === 0 ? (
            <p>你还没有收藏夹</p>
          ) : (
            <ul className="bili-fav-list">
              {folders.map((f) => (
                <li key={f.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={checked.has(f.id)}
                      onChange={(e) => {
                        setChecked((cur) => {
                          const next = new Set(cur);
                          if (e.target.checked) next.add(f.id);
                          else next.delete(f.id);
                          return next;
                        });
                      }}
                    />
                    <span>{f.title}</span>
                    <em>{f.mediaCount}</em>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="bili-pop-actions">
            <button
              className="app-btn-primary"
              onClick={submitFav}
              disabled={busy === "favApply"}
            >
              {busy === "favApply" ? "保存中…" : "确定"}
            </button>
            <button
              className="bili-pop-cancel"
              onClick={() => setFolders(null)}
            >
              取消
            </button>
          </div>
        </div>
      )}

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
