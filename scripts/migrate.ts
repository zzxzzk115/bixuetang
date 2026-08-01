// 手动跑迁移：npm run migrate（服务启动时 instrumentation.ts 也会自动跑）
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const dbPath =
  process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "dev.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "drizzle") });
sqlite.close();
console.log(`migrated: ${dbPath}`);
