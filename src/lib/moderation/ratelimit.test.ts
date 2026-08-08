import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { countRecent, isOverLimit, RATE } from "./ratelimit-core";

// 用内存库直接测计数 SQL + 窗口边界,不碰真实 db(那会拉进 server-only)。
const rows = sqliteTable("rows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  createdAt: integer("created_at").notNull(),
});

function freshDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(
    "CREATE TABLE rows (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, created_at INTEGER NOT NULL)",
  );
  return drizzle(sqlite);
}

test("只数窗口内 + 只数该用户", () => {
  const db = freshDb();
  const now = 1_000_000_000;
  const window = 3_600_000; // 1 小时
  // user 1:窗口内 3 条、窗口外 2 条
  for (const dt of [0, 1000, 60_000, window + 1, window + 999]) {
    db.insert(rows).values({ userId: 1, createdAt: now - dt }).run();
  }
  // user 2:窗口内 1 条(不应算进 user 1)
  db.insert(rows).values({ userId: 2, createdAt: now }).run();

  assert.equal(
    countRecent(db, rows, rows.userId, rows.createdAt, 1, window, now),
    3,
  );
  assert.equal(
    countRecent(db, rows, rows.userId, rows.createdAt, 2, window, now),
    1,
  );
  // 没写过的用户:0
  assert.equal(
    countRecent(db, rows, rows.userId, rows.createdAt, 99, window, now),
    0,
  );
});

test("窗口边界:恰好等于 since 的行算在内", () => {
  const db = freshDb();
  const now = 5_000_000;
  const window = 1000;
  db.insert(rows).values({ userId: 1, createdAt: now - window }).run(); // 边界(>=)
  db.insert(rows).values({ userId: 1, createdAt: now - window - 1 }).run(); // 差 1ms 出界
  assert.equal(
    countRecent(db, rows, rows.userId, rows.createdAt, 1, window, now),
    1,
  );
});

test("isOverLimit:达到上限即拒,未达放行", () => {
  assert.equal(isOverLimit(7, RATE.courseTip), false); // max 8,第 8 条(count=7)仍放行
  assert.equal(isOverLimit(8, RATE.courseTip), true); // 已有 8 条,第 9 条拒
  assert.equal(isOverLimit(0, RATE.follow), false);
});

test("RATE 额度都是正整数窗口", () => {
  for (const [k, r] of Object.entries(RATE)) {
    assert.ok(r.max >= 1, `${k} max 应 ≥1`);
    assert.ok(r.windowMs > 0, `${k} windowMs 应 >0`);
    assert.ok(Number.isInteger(r.max), `${k} max 应为整数`);
  }
});
