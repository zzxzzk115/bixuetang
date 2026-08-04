import { avatarSrc } from "@/lib/avatar/presets";

/**
 * 用户头像。没设置过就回退到站点徽记（avatarSrc 内部兜底）。
 */
export function UserAvatar({
  userId,
  avatar,
  name,
  size = 40,
  className = "",
}: {
  userId: number;
  avatar: string | null | undefined;
  name: string;
  size?: number;
  className?: string;
}) {
  const src = avatarSrc(avatar, userId);

  if (!src) {
    return (
      <span className={`game-avatar ${className}`} aria-label={name}>
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }

  return (
    // 数据卷里的图片走自建路由，Next 的图片优化对它没有意义，用原生 img
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      className={`game-avatar game-avatar-img ${className}`}
      referrerPolicy="no-referrer"
    />
  );
}
