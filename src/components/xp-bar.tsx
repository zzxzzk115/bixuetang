import type { LevelProgress } from "@/lib/game/level";

export function XpBar({
  level,
  compact = false,
}: {
  level: LevelProgress;
  compact?: boolean;
}) {
  const pct = Math.round(level.ratio * 100);
  return (
    <div className={compact ? "w-32" : "w-full"}>
      <div className="flex items-baseline justify-between text-xs text-muted">
        <span className="font-bold text-gold">Lv.{level.level}</span>
        {!compact && (
          <span>
            {level.current} / {level.span} XP
          </span>
        )}
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-edge">
        <div
          className="h-full rounded-full bg-xp transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
