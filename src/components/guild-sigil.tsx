import { SIGIL_SIZE, sigilRects } from "@/lib/brand/sigil";

const RECTS = sigilRects();

/**
 * 公会徽记。网格定义在 src/lib/brand/sigil.ts，与 favicon 同源。
 * shape-rendering=crispEdges 保证缩放后仍是硬边像素，不糊。
 */
export function GuildSigil({
  size = 32,
  className,
  title = "学者公会",
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
      shapeRendering="crispEdges"
      className={className}
      role="img"
      aria-label={title}
    >
      {RECTS.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </svg>
  );
}
