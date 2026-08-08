import "server-only";
import { cookies } from "next/headers";

// 拉新归因:分享链接带 ?ref=<userId>,middleware 见到就种一个 ref cookie;
// 新用户注册/建号时取出并写入 users.referred_by(一次性,取完即清)。

export const REF_COOKIE = "ref";

/** 取出并清掉 ref cookie,返回合法的推荐人 id(排除自荐由调用方做)。 */
export async function takeReferrer(): Promise<number | null> {
  const store = await cookies();
  const raw = store.get(REF_COOKIE)?.value;
  if (!raw) return null;
  store.delete(REF_COOKIE);
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}
