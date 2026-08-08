import { NextResponse } from "next/server";

// 客户端订阅要用的 VAPID 公钥(公开)。从服务端 env 读,换密钥不用重新构建。
export function GET() {
  return NextResponse.json({ key: process.env.VAPID_PUBLIC_KEY ?? null });
}
