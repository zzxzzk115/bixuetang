import { NextResponse, type NextRequest } from "next/server";

// 管理端走独立子域 admin.<SITE_DOMAIN>,但和游戏端同一个 Next 服务:
//   · admin 子域的请求 → 内部重写到 /console/* 树(URL 对用户仍是干净的 /users 等)
//   · 主域访问 /console/* → 挡掉(生产),避免 bixuetang.com/console 泄露入口
//   · 本地开发没有子域,允许直接访问 localhost/console/* 方便联调
// 命中管理端时给**请求头**打 x-admin-console,根 layout 用 headers() 读它切 PWA/标题/去游戏层。

const CONSOLE_PREFIX = "/console";

// 这些路径不加前缀:静态与接口在两个域下共享同一份
function isPassthrough(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/icon") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname === "/console.webmanifest" ||
    pathname === "/console-sw.js" ||
    pathname.startsWith("/avatars/")
  );
}

function isLocalHost(host: string): boolean {
  const h = host.split(":")[0];
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h === "127.0.0.1" ||
    h === "0.0.0.0"
  );
}

function withAdminHeader(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  headers.set("x-admin-console", "1");
  return headers;
}

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const isAdminHost = host.startsWith("admin.");
  const { pathname } = request.nextUrl;

  if (isAdminHost) {
    if (isPassthrough(pathname) || pathname.startsWith(CONSOLE_PREFIX)) {
      return NextResponse.next({ request: { headers: withAdminHeader(request) } });
    }
    const url = request.nextUrl.clone();
    url.pathname = CONSOLE_PREFIX + pathname; // "/" → "/console", "/users" → "/console/users"
    return NextResponse.rewrite(url, {
      request: { headers: withAdminHeader(request) },
    });
  }

  // 非管理子域访问 /console/*:本地放行(联调),生产挡成 404
  if (pathname.startsWith(CONSOLE_PREFIX)) {
    if (isLocalHost(host)) {
      return NextResponse.next({ request: { headers: withAdminHeader(request) } });
    }
    return new NextResponse(null, { status: 404 });
  }

  const res = NextResponse.next();
  // 拉新:分享链接带 ?ref=<数字> 就种一个 cookie,注册时读取归因(见 lib/referral.ts)
  const ref = request.nextUrl.searchParams.get("ref");
  if (ref && /^\d{1,12}$/.test(ref)) {
    res.cookies.set("ref", ref, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
  }
  return res;
}

export const config = {
  // 跑在除静态资源外的所有路径上;host 判定在函数内做
  matcher: ["/((?!_next/static|_next/image).*)"],
};
