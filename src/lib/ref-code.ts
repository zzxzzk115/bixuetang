import crypto from "node:crypto";

// 邀请/分享链接里的推荐人标识:不再明文暴露自增用户 id,改成「base36(id)~HMAC 短签名」。
// 服务端可解、可校验(签名对不上就丢弃),别人拿不到 id、也难以伪造指向任意用户。
// 仅用于拉新归因(低风险):即便签名被伪造,最多只是错误地把某人记成推荐人。
//
// 注意:只在 Node 运行时用(referral / 页面 server component)。middleware(edge)不解码,
// 只按安全字符透传进 cookie,真正解码在注册时的 Node 侧做。

const SECRET =
  process.env.REF_SECRET || "bixuetang-dev-ref-secret-set-REF_SECRET-in-prod";

function sign(payload: string): string {
  return crypto
    .createHmac("sha256", SECRET)
    .update(payload)
    .digest("base64url")
    .slice(0, 10);
}

/** 编码:userId → "js~aB3xY_..."(base36 载荷 + '~' + 10 位签名) */
export function encodeRef(userId: number): string {
  const p = userId.toString(36);
  return `${p}~${sign(p)}`;
}

/** 解码 + 验签:非法/签名不符返回 null */
export function decodeRef(code: string | null | undefined): number | null {
  if (!code) return null;
  const i = code.indexOf("~");
  if (i <= 0) return null;
  const p = code.slice(0, i);
  const sig = code.slice(i + 1);
  if (!/^[0-9a-z]+$/.test(p) || sign(p) !== sig) return null;
  const id = parseInt(p, 36);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** 供 middleware 用的宽松格式校验(不验签,只挡明显垃圾):base36~base64url */
export const REF_CODE_RE = /^[0-9a-z]{1,9}~[A-Za-z0-9_-]{8,16}$/;
