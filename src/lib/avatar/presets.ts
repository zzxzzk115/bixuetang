// 内置像素头像。复用 public/assets/pixel-dungeon 的 0x72 素材（CC0，见该目录的
// ATTRIBUTION.md），与地下城场景、公会徽记是同一套 16px 视觉语言。
//
// 这些 id 会被写进 users.avatar（形如 `preset:sage`），改名等于让老用户的头像失效，
// 所以 id 一旦发布就不要动。

export interface AvatarPreset {
  id: string;
  label: string;
  src: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "sage", label: "贤者", src: "/assets/pixel-dungeon/npc_sage.png" },
  { id: "knight", label: "黑骑士", src: "/assets/pixel-dungeon/monster_dark_knight.png" },
  { id: "orc", label: "兽人", src: "/assets/pixel-dungeon/monster_orc.png" },
  { id: "skeleton", label: "骷髅", src: "/assets/pixel-dungeon/monster_skelet.png" },
  { id: "zombie", label: "行尸", src: "/assets/pixel-dungeon/monster_zombie.png" },
  { id: "demon", label: "恶魔", src: "/assets/pixel-dungeon/monster_demon.png" },
  { id: "sword", label: "金剑", src: "/assets/pixel-dungeon/weapon_sword_golden.png" },
  { id: "chest", label: "宝箱", src: "/assets/pixel-dungeon/chest_golden_open_full.png" },
];

const BY_ID = new Map(AVATAR_PRESETS.map((p) => [p.id, p]));

export function presetById(id: string): AvatarPreset | undefined {
  return BY_ID.get(id);
}

/** users.avatar 的取值解析。无法识别的一律当作「未设置」，不抛错 */
export type AvatarRef =
  | { kind: "preset"; preset: AvatarPreset }
  | { kind: "upload"; version: string }
  | { kind: "remote"; url: string }
  | { kind: "none" };

export function parseAvatar(value: string | null | undefined): AvatarRef {
  if (!value) return { kind: "none" };
  const sep = value.indexOf(":");
  if (sep < 0) return { kind: "none" };
  const kind = value.slice(0, sep);
  const rest = value.slice(sep + 1);
  if (kind === "preset" && rest) {
    const preset = presetById(rest);
    return preset ? { kind: "preset", preset } : { kind: "none" };
  }
  if (kind === "upload" && rest) return { kind: "upload", version: rest };
  // 扫码登录带回来的 B 站头像：只认 https 的 B 站图床，别变成任意图片代理
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
  if (ref.kind === "preset") return ref.preset.src;
  if (ref.kind === "upload") return `/avatars/${userId}?v=${ref.version}`;
  if (ref.kind === "remote") return ref.url;
  return null;
}
