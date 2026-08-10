import { Award, Flame, GraduationCap, Sparkles, TrendingUp } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import type { FeedItem, FeedType } from "@/lib/game/feed";

// 好友动态列表(纯展示):每条 = 头像 + 一句话 + 相对时间,按类型着色/配图标。

const META: Record<FeedType, { tone: string; Icon: typeof Flame }> = {
  course_done: { tone: "var(--app-green)", Icon: GraduationCap },
  streak: { tone: "var(--app-orange)", Icon: Flame },
  tier_up: { tone: "var(--app-gold)", Icon: TrendingUp },
  achievement: { tone: "var(--app-purple)", Icon: Award },
  level_up: { tone: "var(--app-blue)", Icon: Sparkles },
};

export function FeedList({ items }: { items: FeedItem[] }) {
  if (items.length === 0) {
    return (
      <p className="me-note">
        还没有动态。你和好友完成课程、连胜达标、升段升级时,都会出现在这里。
      </p>
    );
  }
  return (
    <ul className="feed-list">
      {items.map((it) => {
        const { tone, Icon } = META[it.type] ?? META.level_up;
        return (
          <li key={it.id} className="feed-item">
            <UserAvatar userId={it.actorId} avatar={it.actorAvatar} name={it.actorName} size={34} />
            <div className="feed-body">
              <p>
                <b>{it.isSelf ? "你" : it.actorName}</b> {it.message}
              </p>
              <small>{it.ago}</small>
            </div>
            <span className="feed-icon" style={{ color: tone }}>
              <Icon size={17} aria-hidden />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
