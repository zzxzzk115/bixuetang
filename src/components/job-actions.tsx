"use client";

import { useState, useTransition } from "react";
import { celebrate } from "@/lib/celebrate";
import { promoteJob, setActiveTitle } from "@/lib/game/actions";

export function PromoteButton({ jobId, title }: { jobId: string; title: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <button
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await promoteJob(jobId);
            if (!res.ok) setError(res.error ?? "转职失败");
            else
              celebrate({
                kind: "promote",
                title: "转职成功！",
                subtitle: `你现在是「${title}」`,
              });
          });
        }}
        disabled={pending}
        className="animate-glow w-full rounded border border-gold py-2 text-sm font-bold text-gold transition-colors hover:bg-gold hover:text-background disabled:opacity-50"
      >
        {pending ? "转职中……" : `⚜️ 转职为「${title}」`}
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
      <span className="block w-full rounded border border-edge bg-amber-100 py-2 text-center text-sm text-gold dark:bg-amber-950">
        ✓ 当前称号
      </span>
    );
  }
  return (
    <button
      onClick={() => startTransition(async () => void (await setActiveTitle(jobId)))}
      disabled={pending}
      className="w-full rounded border border-edge py-2 text-sm text-muted transition-colors hover:border-gold hover:text-gold disabled:opacity-50"
    >
      佩戴此称号
    </button>
  );
}
