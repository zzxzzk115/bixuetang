"use client";

import { useState, useTransition } from "react";
import { celebrate } from "@/lib/celebrate";
import { promoteJob, setActiveTitle } from "@/lib/game/actions";

export function PromoteButton({
  jobId,
  title,
}: {
  jobId: string;
  title: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <button
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await promoteJob(jobId);
            if (!result.ok) {
              setError(result.error ?? "转职失败");
            } else {
              celebrate({
                kind: "promote",
                title: "转职完成",
                subtitle: `职业档案已更新为「${title}」`,
              });
            }
          });
        }}
        disabled={pending}
        className="command-button w-full disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "仪式进行中…" : `执行转职 · ${title}`}
      </button>
      {error && <p className="mt-1.5 text-sm text-hp">{error}</p>}
    </div>
  );
}

export function TitleButton({
  jobId,
  isActive,
}: {
  jobId: string;
  isActive: boolean;
}) {
  const [pending, startTransition] = useTransition();
  if (isActive) {
    return (
      <span className="block w-full border border-gold bg-background/50 py-2 text-center font-mono text-[10px] text-gold">
        ACTIVE TITLE
      </span>
    );
  }
  return (
    <button
      onClick={() =>
        startTransition(async () => void (await setActiveTitle(jobId)))
      }
      disabled={pending}
      className="command-button secondary w-full disabled:opacity-50"
    >
      设为当前职业
    </button>
  );
}
