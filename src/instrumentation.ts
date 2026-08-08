// 服务启动时自动跑数据库迁移：npm run dev 与 Docker 容器共用同一条路径，
// 不需要单独的 entrypoint 脚本。
export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { runMigrations } = await import("./lib/db/migrate");
    runMigrations();
    // 迁移落地后播种默认管理员(表空时才建)
    const { seedAdmin } = await import("./lib/admin/seed");
    await seedAdmin();
  }
}
