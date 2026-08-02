"use server";

import { revalidatePath } from "next/cache";
import { createApiToken, revokeApiToken } from "./api-token";
import { getCurrentUser } from "./session";

export type TokenFormState =
  | { token: string; label: string }
  | { error: string }
  | null;

export async function generateToken(
  _prev: TokenFormState,
  formData: FormData,
): Promise<TokenFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "请先登录" };
  const label = String(formData.get("label") ?? "").trim() || "浏览器插件";
  const token = createApiToken(user.id, label);
  revalidatePath("/settings");
  // 明文只在这里返回一次，之后库里只有哈希
  return { token, label };
}

export async function revokeToken(tokenHash: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  revokeApiToken(user.id, tokenHash);
  revalidatePath("/settings");
  return { ok: true };
}
