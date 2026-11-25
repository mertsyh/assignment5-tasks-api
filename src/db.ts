// STUDENT NAME, STUDENT NUMBER
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema.ts";

export type Db = ReturnType<typeof createDb>;

/** Open a database. Tests pass "file::memory:" or a temporary file. */
export function createDb(url: string) {
  const client = createClient({ url });
  const db = drizzle(client, { schema });
  return { db, client };
}

/** Create the tables if they do not exist yet. Keep this in sync with schema.ts. */
export async function migrate({ client }: Db) {
  await client.batch([
    `CREATE TABLE IF NOT EXISTS users (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       email TEXT NOT NULL UNIQUE,
       password_hash TEXT NOT NULL,
       created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
     )`,
    `CREATE TABLE IF NOT EXISTS sessions (
       token TEXT PRIMARY KEY,
       user_id INTEGER NOT NULL REFERENCES users(id),
       expires_at INTEGER NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS tasks (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id INTEGER NOT NULL REFERENCES users(id),
       title TEXT NOT NULL,
       course_code TEXT,
       status TEXT NOT NULL DEFAULT 'todo',
       priority TEXT NOT NULL DEFAULT 'medium',
       created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
     )`,
    // priority, created_at). Status is one of: todo, in-progress, done.
  ]);

  const columns = await client.execute("PRAGMA table_info(tasks)");

  const hasCourseCode = columns.rows.some(
    (column) => column.name === "course_code",
  );

  if (!hasCourseCode) {
    await client.execute("ALTER TABLE tasks ADD COLUMN course_code TEXT");
  }
}
