"use client";

import { useActionState } from "react";
import {
  chooseAvatarPreset,
  clearAvatar,
  uploadAvatar,
  type AvatarFormState,
} from "@/lib/avatar/actions";
import { MAX_AVATAR_BYTES } from "@/lib/avatar/limits";
import { AVATAR_PRESETS, parseAvatar } from "@/lib/avatar/presets";

const btnCls =
  "rounded border border-gold px-4 py-2 text-sm font-bold text-gold transition-colors hover:bg-gold hover:text-background disabled:opacity-50";

function Feedback({ state }: { state: AvatarFormState }) {
  if (!state) return null;
  if ("error" in state) return <p className="text-sm text-hp">{state.error}</p>;
  return <p className="text-sm text-xp">✓ {state.ok}</p>;
}

export function AvatarForm({ avatar }: { avatar: string | null }) {
  const ref = parseAvatar(avatar);
  const currentPreset = ref.kind === "preset" ? ref.preset.id : null;

  const [presetState, presetAction, presetPending] = useActionState<
    AvatarFormState,
    FormData
  >(chooseAvatarPreset, null);
  const [uploadState, uploadAction, uploadPending] = useActionState<
    AvatarFormState,
    FormData
  >(uploadAvatar, null);

  return (
    <div className="space-y-5">
      <form action={presetAction} className="space-y-2">
        <p className="text-xs text-muted">从公会图鉴里挑一个</p>
        <div className="flex flex-wrap gap-2">
          {AVATAR_PRESETS.map((p) => (
            <button
              key={p.id}
              name="preset"
              value={p.id}
              disabled={presetPending}
              title={p.label}
              aria-pressed={currentPreset === p.id}
              className={`flex h-14 w-14 items-center justify-center rounded border transition-colors disabled:opacity-50 ${
                currentPreset === p.id
                  ? "border-gold bg-panel-strong"
                  : "border-edge bg-panel hover:border-gold"
              }`}
            >
              {/* 16px 像素画，必须 pixelated 才不糊 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.src}
                alt={p.label}
                width={36}
                height={36}
                style={{ imageRendering: "pixelated" }}
              />
            </button>
          ))}
        </div>
        <Feedback state={presetState} />
      </form>

      <form action={uploadAction} className="space-y-2 border-t border-edge pt-4">
        <p className="text-xs text-muted">
          或上传自己的图片（PNG / JPEG / WebP，不超过{" "}
          {Math.floor(MAX_AVATAR_BYTES / 1024)} KB）
        </p>
        <input
          type="file"
          name="file"
          accept="image/png,image/jpeg,image/webp"
          required
          className="block w-full text-sm text-muted file:mr-3 file:rounded file:border file:border-edge file:bg-panel file:px-3 file:py-1.5 file:text-sm file:text-foreground hover:file:border-gold"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={uploadPending} className={btnCls}>
            {uploadPending ? "上传中……" : "上传头像"}
          </button>
          {ref.kind !== "none" && (
            <button
              type="button"
              onClick={() => clearAvatar()}
              className="text-xs text-muted underline hover:text-gold"
            >
              恢复默认（首字母）
            </button>
          )}
          <Feedback state={uploadState} />
        </div>
      </form>
    </div>
  );
}
