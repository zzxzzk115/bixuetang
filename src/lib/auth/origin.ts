import { headers } from "next/headers";

// 邮件里链接的站点源:优先 APP_ORIGIN,否则据反代带的 x-forwarded-* 推断。
// 纯 helper,供 reset / verify 等发信流程共用(不放 "use server" 文件——那只能导出 async 且会变成 RPC 端点)。
export async function siteOrigin(): Promise<string> {
  if (process.env.APP_ORIGIN) return process.env.APP_ORIGIN.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
