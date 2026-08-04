import { avatarSrc, parseAvatar } from "@/lib/avatar/presets";

/**
 * 用户头像。没设置过就回退到名字首字母色块（保持改动前的观感）。
 * 预设头像是 16px 像素画，必须 image-rendering: pixelated 才不糊。
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
  const pixelated = parseAvatar(avatar).kind === "preset";

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
      style={pixelated ? { imageRendering: "pixelated" } : undefined}
      referrerPolicy="no-referrer"
    />
  );
}
