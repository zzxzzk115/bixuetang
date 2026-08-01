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
