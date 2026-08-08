import "server-only";
import { hash, verify } from "@node-rs/argon2";

// argon2id，OWASP 推荐参数（19 MiB / t=2 / p=1）
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTS);
}

export function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  return verify(passwordHash, password).catch(() => false);
}

// 时序防探测:登录时「用户不存在」也要跑一次真实 argon2 校验,与「用户存在」
// 分支耗时一致,避免用响应时间枚举账号。用本模块自己的 hashPassword 现算一次
// (与真实用户同参数,时序最贴合),惰性缓存;不写死密文字面量——省得被密钥
// 扫描器(GitGuardian 等)误报成泄露的口令哈希。
let dummyHashPromise: Promise<string> | null = null;
export function dummyPasswordHash(): Promise<string> {
  if (!dummyHashPromise) dummyHashPromise = hashPassword("timing-guard");
  return dummyHashPromise;
}
