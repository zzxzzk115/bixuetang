import fs from "node:fs";
import path from "node:path";

// 上传头像的落盘与校验。
//
// 存在数据库同一个目录下（DATABASE_PATH 的父目录），这样 Docker 里 /data 卷
// 已经挂好、备份数据库时头像一并被带走，不用再配一个卷。

export function avatarDir(): string {
  const dbPath =
    process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "dev.db");
  return path.join(path.dirname(dbPath), "avatars");
}

export function avatarPath(userId: number): string {
  // 文件名完全由 userId 决定，用户输入不参与拼路径，从源头杜绝路径穿越
  return path.join(avatarDir(), `${userId}.bin`);
}

export type ImageKind = "image/png" | "image/jpeg" | "image/webp";

/**
 * 按文件头魔数判断真实类型。
 * 不看 File.type / Content-Type——那是客户端说了算的，可以随便伪造。
 */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  // RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/** 落盘时把类型一起记下来，读的时候才知道回什么 Content-Type */
export function writeAvatar(userId: number, bytes: Uint8Array, kind: ImageKind) {
  fs.mkdirSync(avatarDir(), { recursive: true });
  fs.writeFileSync(avatarPath(userId), bytes);
  fs.writeFileSync(`${avatarPath(userId)}.type`, kind, "utf-8");
}

export function readAvatar(
  userId: number,
): { bytes: Buffer; kind: string } | null {
  const file = avatarPath(userId);
  if (!fs.existsSync(file)) return null;
  let kind = "image/png";
  try {
    kind = fs.readFileSync(`${file}.type`, "utf-8").trim() || kind;
  } catch {
    // 类型旁注丢了就按 PNG 发，浏览器基本都能自行识别
  }
  return { bytes: fs.readFileSync(file), kind };
}

export function deleteAvatar(userId: number) {
  for (const f of [avatarPath(userId), `${avatarPath(userId)}.type`]) {
    try {
      fs.unlinkSync(f);
    } catch {
      // 本来就没有，无所谓
    }
  }
}
