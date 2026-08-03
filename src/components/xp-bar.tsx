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
    <div className={compact ? "w-36" : "w-full"}>
      <div className="flex items-baseline justify-between font-mono text-[12px] text-muted">
        <span className="font-bold text-gold">LEVEL {level.level}</span>
        {!compact && (
          <span>
            {level.current} / {level.span} XP
          </span>
        )}
      </div>
      <div className="progress-track mt-1.5">
        <div
          className="h-full bg-xp transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
