"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "../auth/session";
import { db } from "../db/client";
import { users } from "../db/schema";
import { MAX_AVATAR_BYTES } from "./limits";
import { presetById } from "./presets";
import { deleteAvatar, sniffImage, writeAvatar } from "./storage";
import { getBiliBinding } from "../bili/account";

export type AvatarFormState = { error: string } | { ok: string } | null;

/** 头像出现在顶栏，改完要让所有页面重取 */
function refresh() {
  revalidatePath("/", "layout");
}

export async function chooseAvatarPreset(
  _prev: AvatarFormState,
  formData: FormData,
): Promise<AvatarFormState> {
  const user = await requireUser();
  const id = String(formData.get("preset") ?? "");
  if (!presetById(id)) return { error: "没有这个预设头像" };

  db.update(users)
    .set({ avatar: `preset:${id}` })
    .where(eq(users.id, user.id))
    .run();
  deleteAvatar(user.id); // 换成预设后，之前上传的图不再有用
  refresh();
  return { ok: "头像已更新" };
}

export async function uploadAvatar(
  _prev: AvatarFormState,
  formData: FormData,
): Promise<AvatarFormState> {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "请先选择一张图片" };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return {
      error: `图片不能大于 ${Math.floor(MAX_AVATAR_BYTES / 1024)} KB（当前 ${Math.ceil(file.size / 1024)} KB）`,
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) {
    // 按文件头判断，不信客户端给的 MIME；SVG 能带脚本，这里也一并挡掉
    return { error: "只支持 PNG / JPEG / WebP 图片" };
  }

  writeAvatar(user.id, bytes, kind);
  // 文件名固定为 userId，靠递增版本号让浏览器重新取图
  const version = String(Date.now());
  db.update(users)
    .set({ avatar: `upload:${version}` })
    .where(eq(users.id, user.id))
    .run();
  refresh();
  return { ok: "头像已上传" };
}

export async function clearAvatar(): Promise<void> {
  const user = await requireUser();
  db.update(users).set({ avatar: null }).where(eq(users.id, user.id)).run();
  deleteAvatar(user.id);
  refresh();
}

/** 用绑定的 bilibili 头像。地址存库，parseAvatar 只放行 hdslb 图床 */
export async function useBiliAvatar(): Promise<AvatarFormState> {
  const user = await requireUser();
  const binding = getBiliBinding(user.id);
  if (!binding?.avatarUrl) return { error: "还没绑定 bilibili 账号" };

  db.update(users)
    .set({ avatar: `bili:${binding.avatarUrl}` })
    .where(eq(users.id, user.id))
    .run();
  deleteAvatar(user.id);
  refresh();
  return { ok: "已换成 bilibili 头像" };
}

/** 用站点徽记（清掉自定义头像即是默认） */
export async function useDefaultAvatar(): Promise<AvatarFormState> {
  const user = await requireUser();
  db.update(users).set({ avatar: null }).where(eq(users.id, user.id)).run();
  deleteAvatar(user.id);
  refresh();
  return { ok: "已换回站点徽记" };
}
