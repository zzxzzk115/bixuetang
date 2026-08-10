"use client";

import { useState } from "react";
import {
  Award,
  Flame,
  GraduationCap,
  Heart,
  MessageCircle,
  Send,
  Sparkles,
  TrendingUp,
  Trash2,
} from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import type { FeedItem, FeedType } from "@/lib/game/feed";
import type { FeedComment } from "@/lib/game/feed-social";
import {
  addFeedComment,
  deleteFeedComment,
  loadFeedComments,
  toggleFeedLike,
} from "@/lib/game/feed-social-actions";

// 好友动态列表:每条 = 头像 + 一句话 + 相对时间(按类型着色/配图标),
// 底部可点赞、可展开评论区(按需拉取)。互动是乐观更新,失败回滚。

const META: Record<FeedType, { tone: string; Icon: typeof Flame }> = {
  course_done: { tone: "var(--app-green)", Icon: GraduationCap },
  streak: { tone: "var(--app-orange)", Icon: Flame },
  tier_up: { tone: "var(--app-gold)", Icon: TrendingUp },
  achievement: { tone: "var(--app-purple)", Icon: Award },
  level_up: { tone: "var(--app-blue)", Icon: Sparkles },
};

export function FeedList({
  items,
  initialVisible = 8,
}: {
  items: FeedItem[];
  /** 先只渲染这么多条,其余「展开更多」再显示,防止动态多了把页面撑长 */
  initialVisible?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  if (items.length === 0) {
    return (
      <p className="me-note">
        还没有动态。你和好友完成课程、连胜达标、升段升级时,都会出现在这里。
      </p>
    );
  }
  const shown = showAll ? items : items.slice(0, initialVisible);
  const rest = items.length - shown.length;
  return (
    <>
      <ul className="feed-list">
        {shown.map((it) => (
          <FeedRow key={it.id} item={it} />
        ))}
      </ul>
      {rest > 0 && (
        <button className="feed-more" onClick={() => setShowAll(true)}>
          展开剩余 {rest} 条
        </button>
      )}
      {showAll && items.length > initialVisible && (
        <button className="feed-more" onClick={() => setShowAll(false)}>
          收起
        </button>
      )}
    </>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  const { tone, Icon } = META[item.type] ?? META.level_up;
  const [liked, setLiked] = useState(item.liked);
  const [likeCount, setLikeCount] = useState(item.likeCount);
  const [commentCount, setCommentCount] = useState(item.commentCount);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<FeedComment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const like = async () => {
    const prevLiked = liked;
    const prevCount = likeCount;
    setLiked(!prevLiked);
    setLikeCount(prevCount + (prevLiked ? -1 : 1));
    const r = await toggleFeedLike(item.id);
    if (r.ok && typeof r.count === "number") {
      setLiked(!!r.liked);
      setLikeCount(r.count);
    } else {
      setLiked(prevLiked);
      setLikeCount(prevCount);
    }
  };

  const toggleComments = async () => {
    const next = !open;
    setOpen(next);
    if (next && comments === null) {
      setLoading(true);
      const list = await loadFeedComments(item.id);
      setComments(list);
      setLoading(false);
    }
  };

  const post = async () => {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    setErr(null);
    const r = await addFeedComment(item.id, body);
    setPosting(false);
    if (!r.ok || !r.comment) {
      setErr(r.error ?? "发送失败");
      return;
    }
    setComments((c) => [...(c ?? []), r.comment!]);
    setCommentCount((n) => n + 1);
    setDraft("");
  };

  const remove = async (id: number) => {
    setComments((c) => (c ?? []).filter((x) => x.id !== id));
    setCommentCount((n) => Math.max(0, n - 1));
    await deleteFeedComment(id);
  };

  return (
    <li className="feed-item">
      <div className="feed-top">
        <UserAvatar
          userId={item.actorId}
          avatar={item.actorAvatar}
          name={item.actorName}
          size={34}
        />
        <div className="feed-body">
          <p>
            <b>{item.isSelf ? "你" : item.actorName}</b> {item.message}
          </p>
          <small>{item.ago}</small>
        </div>
        <span className="feed-icon" style={{ color: tone }}>
          <Icon size={17} aria-hidden />
        </span>
      </div>

      <div className="feed-actions">
        <button
          className={`feed-act${liked ? " on" : ""}`}
          onClick={like}
          aria-pressed={liked}
        >
          <Heart size={15} aria-hidden fill={liked ? "currentColor" : "none"} />
          {likeCount > 0 ? likeCount : "赞"}
        </button>
        <button
          className={`feed-act${open ? " on" : ""}`}
          onClick={toggleComments}
          aria-expanded={open}
        >
          <MessageCircle size={15} aria-hidden />
          {commentCount > 0 ? commentCount : "评论"}
        </button>
      </div>

      {open && (
        <div className="feed-comments">
          {loading && <p className="me-note">加载中…</p>}
          {comments?.map((c) => (
            <div key={c.id} className="feed-comment">
              <UserAvatar
                userId={c.authorId}
                avatar={c.authorAvatar}
                name={c.authorName}
                size={26}
              />
              <div className="feed-comment-body">
                <p>
                  <b>{c.authorName}</b> {c.body}
                </p>
                <small>{c.ago}</small>
              </div>
              {c.isSelf && (
                <button
                  className="feed-comment-del"
                  onClick={() => remove(c.id)}
                  aria-label="删除评论"
                >
                  <Trash2 size={13} aria-hidden />
                </button>
              )}
            </div>
          ))}
          {comments && comments.length === 0 && !loading && (
            <p className="me-note">还没有评论,来说第一句。</p>
          )}
          <div className="feed-comment-form">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void post();
                }
              }}
              maxLength={200}
              placeholder="友善地留个言…"
              className="feed-comment-input"
            />
            <button
              className="feed-comment-send"
              onClick={post}
              disabled={posting || !draft.trim()}
              aria-label="发送"
            >
              <Send size={15} aria-hidden />
            </button>
          </div>
          {err && <p className="feed-comment-err">{err}</p>}
        </div>
      )}
    </li>
  );
}
