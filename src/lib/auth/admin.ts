import "server-only";
import type { SessionUser } from "./session";

// 站点没有角色系统(自托管单人/小团队)。运营权限用环境变量圈定,优先级:
//   1) ADMIN_USER_IDS=1,5      # 逗号分隔的用户 id —— 首选,id 不可变、不会被抢注
//   2) ADMIN_USERNAMES=alice   # 逗号分隔的用户名 —— 兼容用,注意用户名可改
//   3) 都没配 → 默认首个账号(id=1)是管理员,本地开箱即用
//
// 生产环境务必显式配 ADMIN_USER_IDS 指向你本人的号:线上"谁先注册谁是 id=1"
// 未必是站主。用户名可在设置页修改,所以按 id 判比按名字判稳。
export function isAdmin(user: SessionUser | null | undefined): boolean {
  if (!user) return false;

  const ids = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length) return ids.includes(user.id);

  const names = (process.env.ADMIN_USERNAMES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.length) return names.includes(user.username);

  return user.id === 1;
}
