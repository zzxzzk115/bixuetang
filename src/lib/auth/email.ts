// 邮箱规范化与校验(纯函数,供多个 server action 共用)。
// 不放在 "use server" 文件里——那种文件只能导出 async 函数。

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email) && email.length <= 254;
}
