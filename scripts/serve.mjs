// 本地生产托管：组装 standalone 产物并启动（与 Docker 镜像同一运行方式）。
// 用法：pnpm build && pnpm serve   （PORT / DATABASE_PATH 可用环境变量覆盖）
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, ".next", "standalone");
// 运行目录与构建产物分离：否则运行中的服务占着 .next/standalone，
// 下一次 pnpm build 会 EBUSY 失败
const runtime = path.join(root, ".runtime");

if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error("未找到 .next/standalone，请先执行 pnpm build");
  process.exit(1);
}

fs.rmSync(runtime, { recursive: true, force: true });
fs.cpSync(standalone, runtime, { recursive: true });
// standalone 只打包被 trace 到的依赖；这些目录是运行期 fs 读取，需手动同步
for (const dir of ["content", "drizzle", "public"]) {
  fs.cpSync(path.join(root, dir), path.join(runtime, dir), { recursive: true });
}
fs.cpSync(
  path.join(root, ".next", "static"),
  path.join(runtime, ".next", "static"),
  { recursive: true },
);

const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: process.env.PORT ?? "3000",
  HOSTNAME: process.env.HOSTNAME ?? "0.0.0.0",
  DATABASE_PATH:
    process.env.DATABASE_PATH ?? path.join(root, "data", "dev.db"),
};

console.log(`必学堂 → http://localhost:${env.PORT}`);
console.log(`数据库: ${env.DATABASE_PATH}`);

const child = spawn(process.execPath, ["server.js"], {
  cwd: runtime,
  env,
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 0));
