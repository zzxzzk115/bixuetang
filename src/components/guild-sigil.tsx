import {
  SIGIL_CHECK_PATH,
  SIGIL_CHECK_WIDTH,
  SIGIL_COLORS,
  SIGIL_HOUSE_PATH,
  SIGIL_SIZE,
} from "@/lib/brand/sigil";

/**
 * 站点徽记：屋顶下面一个对勾。路径定义在 src/lib/brand/sigil.ts，
 * 与 favicon / OG 图同源。
 */
export function GuildSigil({
  size = 32,
  className,
  title = "必学堂",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${SIGIL_SIZE} ${SIGIL_SIZE}`}
      className={className}
      role="img"
      aria-label={title}
    >
      <path d={SIGIL_HOUSE_PATH} fill={SIGIL_COLORS.green} />
      <path
        d={SIGIL_CHECK_PATH}
        fill="none"
        stroke={SIGIL_COLORS.ink}
        strokeWidth={SIGIL_CHECK_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
