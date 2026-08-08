import "server-only";
import type { SessionUser } from "./session";

// 站点没有角色系统(自托管单人/小团队)。运营权限用环境变量圈定:
//   ADMIN_USERNAMES=alice,bob   # 逗号分隔的用户名
// 没配时默认首个账号(id=1,即站主)是管理员,开箱即用。
export function isAdmin(user: SessionUser | null | undefined): boolean {
  if (!user) return false;
  const names = (process.env.ADMIN_USERNAMES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.length) return names.includes(user.username);
  return user.id === 1;
}
