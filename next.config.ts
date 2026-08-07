import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "@node-rs/argon2"],
  // dev 下手机扫局域网二维码真机调试:Next 默认只信 localhost,
  // 跨源的 Server Action(登录/打卡全是 action)会被拦成「无法交互」。
  // 只影响开发模式,生产不读这个配置。
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
};

export default nextConfig;
