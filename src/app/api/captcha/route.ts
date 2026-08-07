import { newCaptcha } from "@/lib/auth/captcha";

// 注册验证码:返回一张 SVG 与配套 token(答案经 HMAC 签进 token,
// 服务端无状态)。刷新即换一张。

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(newCaptcha(), {
    headers: { "cache-control": "no-store" },
  });
}
