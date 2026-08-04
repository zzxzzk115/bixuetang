// 头像取值的解析。
//
// 早先有一套 16px 像素预设头像（复用地下城素材），随那套视觉一起退役了；
// `preset:*` 的老数据在这里认不出来，会自动退化成站点徽记，不需要迁移。

/** users.avatar 的取值解析。无法识别的一律当作「未设置」，不抛错 */
export type AvatarRef =
  | { kind: "upload"; version: string }
  | { kind: "remote"; url: string }
  | { kind: "none" };

export function parseAvatar(value: string | null | undefined): AvatarRef {
  if (!value) return { kind: "none" };
  const sep = value.indexOf(":");
  if (sep < 0) return { kind: "none" };
  const kind = value.slice(0, sep);
  const rest = value.slice(sep + 1);
  if (kind === "upload" && rest) return { kind: "upload", version: rest };
  // 扫码登录带回来的 bilibili 头像：只认 https 的 bilibili 图床，别变成任意图片代理
  if (kind === "bili" && /^https:\/\/[\w.-]*hdslb\.com\//.test(rest)) {
    return { kind: "remote", url: rest };
  }
  return { kind: "none" };
}

/** 供 <img src> 用；upload 带版本号 query 破缓存 */
export function avatarSrc(
  value: string | null | undefined,
  userId: number,
): string | null {
  const ref = parseAvatar(value);
  if (ref.kind === "upload") return `/avatars/${userId}?v=${ref.version}`;
  if (ref.kind === "remote") return ref.url;
  // 没设置过就用站点徽记兜底，比首字母色块体面
  return SIGIL_SRC;
}

/** 默认头像 = 站点徽记（app/icon.svg 由 sigil 网格生成） */
export const SIGIL_SRC = "/icon.svg";
