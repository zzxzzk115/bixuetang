"use client";

import { useRef, useState } from "react";
import { Loader2, Shield, Upload, UserRound } from "lucide-react";
import { AvatarCropper } from "./avatar-cropper";
import {
  uploadAvatar,
  useBiliAvatar,
  useDefaultAvatar,
  type AvatarFormState,
} from "@/lib/avatar/actions";
import { MAX_AVATAR_BYTES } from "@/lib/avatar/limits";
import { parseAvatar, SIGIL_SRC } from "@/lib/avatar/presets";

// 头像来源三选一：bilibili 头像 / 站点徽记（默认）/ 自己上传。
// 上传走裁切器，出来的一定是正方形，前端后端都不用再操心比例。

export function AvatarForm({
  avatar,
  userId,
  biliAvatarUrl,
}: {
  avatar: string | null;
  userId: number;
  biliAvatarUrl: string | null;
}) {
  const ref = parseAvatar(avatar);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<AvatarFormState>(null);

  const current: "bili" | "upload" | "sigil" =
    ref.kind === "remote" ? "bili" : ref.kind === "upload" ? "upload" : "sigil";

  const run = async (fn: () => Promise<AvatarFormState>) => {
    setBusy(true);
    setState(await fn());
    setBusy(false);
  };

  const submitCropped = async (blob: Blob) => {
    setPicked(null);
    if (blob.size > MAX_AVATAR_BYTES) {
      setState({
        error: `裁出来还是太大（${Math.ceil(blob.size / 1024)} KB），换张小一点的图`,
      });
      return;
    }
    const form = new FormData();
    form.append("file", new File([blob], "avatar.jpg", { type: "image/jpeg" }));
    await run(() => uploadAvatar(null, form));
  };

  if (picked) {
    return (
      <AvatarCropper
        file={picked}
        onCancel={() => setPicked(null)}
        onDone={(blob) => void submitCropped(blob)}
      />
    );
  }

  return (
    <div className="avatar-pick">
      <div className="avatar-pick-row">
        <button
          className={`avatar-pick-card ${current === "sigil" ? "on" : ""}`}
          onClick={() => void run(useDefaultAvatar)}
          disabled={busy}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SIGIL_SRC} alt="" />
          <b>
            <Shield size={13} aria-hidden /> 站点徽记
          </b>
          <small>默认</small>
        </button>

        <button
          className={`avatar-pick-card ${current === "bili" ? "on" : ""}`}
          onClick={() => void run(useBiliAvatar)}
          disabled={busy || !biliAvatarUrl}
          title={biliAvatarUrl ? undefined : "绑定 bilibili 账号后可用"}
        >
          {biliAvatarUrl ? (
            // bilibili 图床是外部源，用原生 img 绕开 next/image 的域名白名单
            // eslint-disable-next-line @next/next/no-img-element
            <img src={biliAvatarUrl} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="avatar-pick-blank">
              <UserRound size={22} aria-hidden />
            </span>
          )}
          <b>bilibili 头像</b>
          <small>{biliAvatarUrl ? "同步自账号" : "需先绑定"}</small>
        </button>

        <button
          className={`avatar-pick-card ${current === "upload" ? "on" : ""}`}
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          {current === "upload" && ref.kind === "upload" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/avatars/${userId}?v=${ref.version}`} alt="" />
          ) : (
            <span className="avatar-pick-blank">
              <Upload size={22} aria-hidden />
            </span>
          )}
          <b>自己上传</b>
          <small>可裁切</small>
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          // 清掉 value，选同一个文件两次也能再次触发 change
          e.target.value = "";
          if (f) setPicked(f);
        }}
      />

      {busy && (
        <p className="avatar-pick-note">
          <Loader2 size={14} className="spin" aria-hidden /> 保存中…
        </p>
      )}
      {state && "error" in state && (
        <p className="avatar-pick-note is-error">{state.error}</p>
      )}
      {state && "ok" in state && (
        <p className="avatar-pick-note is-ok">✓ {state.ok}</p>
      )}
    </div>
  );
}
