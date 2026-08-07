import "server-only";

import crypto from "node:crypto";

// 自托管验证码:服务端出一张 SVG 字符图,答案不落库——
// token = `${过期时间}.${HMAC(答案+过期时间)}`,注册时带回校验。
// 密钥是进程内随机生成的(单实例部署),重启后旧验证码作废,刷新即可。
// 防的是脚本批量注册,不是国家队;够用就好,不引第三方服务。

const secret = (() => {
  const g = globalThis as unknown as { __captchaSecret?: Buffer };
  if (!g.__captchaSecret) g.__captchaSecret = crypto.randomBytes(32);
  return g.__captchaSecret;
})();

/** 去掉易混字符(0O1lI…)的字符表 */
const CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
const TTL_MS = 5 * 60_000;

function sign(answer: string, exp: number): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${answer.toLowerCase()}:${exp}`)
    .digest("hex")
    .slice(0, 32);
}

export interface CaptchaChallenge {
  svg: string;
  token: string;
}

export function newCaptcha(): CaptchaChallenge {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += CHARS[crypto.randomInt(CHARS.length)];
  }
  const exp = Date.now() + TTL_MS;
  const token = `${exp}.${sign(code, exp)}`;

  // 简单的抗 OCR 手段:逐字旋转/抖动 + 两条干扰线。
  const glyphs = [...code]
    .map((ch, i) => {
      const x = 18 + i * 26 + crypto.randomInt(6);
      const y = 30 + crypto.randomInt(8);
      const rot = crypto.randomInt(41) - 20;
      return `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" font-size="26" font-weight="800" fill="hsl(${crypto.randomInt(360)},45%,45%)" font-family="ui-monospace,monospace">${ch}</text>`;
    })
    .join("");
  const line = () =>
    `<path d="M0,${10 + crypto.randomInt(28)} Q60,${crypto.randomInt(48)} 130,${10 + crypto.randomInt(28)}" stroke="hsl(${crypto.randomInt(360)},40%,60%)" stroke-width="1.6" fill="none"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="130" height="48" viewBox="0 0 130 48">${line()}${glyphs}${line()}</svg>`;
  return { svg, token };
}

export function verifyCaptcha(token: string, answer: string): boolean {
  const [expRaw, mac] = token.split(".");
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  if (!answer || answer.length > 8) return false;
  const expect = sign(answer.trim(), exp);
  try {
    return crypto.timingSafeEqual(Buffer.from(mac ?? ""), Buffer.from(expect));
  } catch {
    return false;
  }
}

/** 密码强度:0 弱 / 1 中 / 2 强。注册要求 ≥1(长度够且字母数字混合)。 */
export function passwordStrength(pwd: string): 0 | 1 | 2 {
  if (pwd.length < 8) return 0;
  const classes =
    Number(/[a-z]/.test(pwd)) +
    Number(/[A-Z]/.test(pwd)) +
    Number(/\d/.test(pwd)) +
    Number(/[^a-zA-Z0-9]/.test(pwd));
  if (classes >= 3 && pwd.length >= 10) return 2;
  if (classes >= 2) return 1;
  return 0;
}
