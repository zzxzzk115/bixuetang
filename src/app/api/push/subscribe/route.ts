import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { pushSubscriptions } from "@/lib/db/schema";

interface SubBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

// 存一条推送订阅(登录态)。同 endpoint 覆盖(换账号/刷新)。
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  let body: SubBody;
  try {
    body = (await req.json()) as SubBody;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (typeof endpoint !== "string" || !p256dh || !auth) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  db.insert(pushSubscriptions)
    .values({ endpoint, userId: user.id, p256dh, auth, createdAt: Date.now() })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: user.id, p256dh, auth },
    })
    .run();
  return NextResponse.json({ ok: true });
}

// 退订:按 endpoint 删。
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  let endpoint: string | undefined;
  try {
    endpoint = ((await req.json()) as SubBody).endpoint;
  } catch {
    endpoint = undefined;
  }
  if (typeof endpoint === "string") {
    db.delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .run();
  }
  return NextResponse.json({ ok: true });
}
