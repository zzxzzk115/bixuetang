import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

// globalThis 单例：dev 下 HMR 会反复执行模块，避免句柄泄漏
const globalForDb = globalThis as unknown as { __guildDb?: Db };

function createDb(): Db {
  const dbPath =
    process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "dev.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  // 偶发并发写(管理端与游戏端同库)时等锁而非立刻 SQLITE_BUSY
  sqlite.pragma("busy_timeout = 5000");
  return drizzle(sqlite, { schema });
}

export const db: Db = globalForDb.__guildDb ?? createDb();
globalForDb.__guildDb = db;
