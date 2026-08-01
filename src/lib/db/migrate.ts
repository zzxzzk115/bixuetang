import "server-only";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./client";

const globalForMigrate = globalThis as unknown as { __guildMigrated?: boolean };

/** 幂等；服务启动时（instrumentation.ts）执行一次 */
export function runMigrations() {
  if (globalForMigrate.__guildMigrated) return;
  migrate(db, {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
  globalForMigrate.__guildMigrated = true;
}
