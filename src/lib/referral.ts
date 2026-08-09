import "server-only";
import { cookies } from "next/headers";
import { decodeRef } from "./ref-code";

// 拉新归因:分享链接带 ?ref=<签名码>,middleware 见到就种一个 ref cookie;
// 新用户注册/建号时解码验签后写入 users.referred_by(一次性,取完即清)。

export const REF_COOKIE = "ref";

/** 取出并清掉 ref cookie,验签解码出推荐人 id(排除自荐由调用方做)。 */
export async function takeReferrer(): Promise<number | null> {
  const store = await cookies();
  const raw = store.get(REF_COOKIE)?.value;
  if (!raw) return null;
  store.delete(REF_COOKIE);
  return decodeRef(raw);
}
