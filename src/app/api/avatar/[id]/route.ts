import { eq } from "drizzle-orm";
import { parseAvatar } from "@/lib/avatar/presets";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

// 同源头像代理:给 canvas(分享图/邀请图)画 bilibili 头像用。
// hdslb 图床不发 CORS 头,canvas 直接跨域取会被污染画不出;这里服务端取回、同源吐出。
// 只代理已在 parseAvatar 里白名单过的 bili 头像(remote),其余一律 404
// (上传/预设本就是同源 URL,canvas 能直接画,不走这里)。
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const uid = Number(id);
  if (!Number.isInteger(uid) || uid <= 0) {
    return new Response(null, { status: 400 });
  }
  const u = db
    .select({ avatar: users.avatar })
    .from(users)
    .where(eq(users.id, uid))
    .get();
  const ref = parseAvatar(u?.avatar);
  if (ref.kind !== "remote") return new Response(null, { status: 404 });

  const upstream = await fetch(ref.url).catch(() => null);
  if (!upstream || !upstream.ok) return new Response(null, { status: 502 });
  const buf = await upstream.arrayBuffer();
  return new Response(buf, {
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "image/jpeg",
      "cache-control": "public, max-age=86400",
    },
  });
}
