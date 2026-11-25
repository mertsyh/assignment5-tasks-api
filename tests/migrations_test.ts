// Mehmet Mert Seyhan, 2300007247
import { assert, assertEquals, assertObjectMatch } from "@std/assert";
import { createDb, migrate } from "../src/db.ts";
import { tasks, users } from "../src/schema.ts";

Deno.test("generated migrations create a fresh database and run only once", async () => {
  const file = await Deno.makeTempFile({ suffix: ".db" });
  const database = createDb(`file:${file}`);

  try {
    await migrate(database);

    const [user] = await database.db.insert(users).values({
      email: "migration@example.com",
      passwordHash: "unused-in-this-database-test",
    }).returning();
    assert(user);

    const [created] = await database.db.insert(tasks).values({
      userId: user.id,
      title: "Preserve this task",
      dueDate: "2030-12-01",
    }).returning();
    assert(created);

    const historyBefore = await database.client.execute(
      "SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at",
    );
    assert(historyBefore.rows.length >= 2);

    await migrate(database);

    assertEquals(await database.db.select().from(tasks), [created]);

    const historyAfter = await database.client.execute(
      "SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at",
    );
    assertEquals(historyAfter.rows, historyBefore.rows);
  } finally {
    database.client.close();
  }
});

Deno.test("migrations preserve users, sessions and tasks from the previous schema", async () => {
  const file = await Deno.makeTempFile({ suffix: ".db" });
  const database = createDb(`file:${file}`);

  try {
    // This fixture represents the hand-written schema before generated migrations.
    await database.client.batch([
      `CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      )`,
      `CREATE TABLE sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        expires_at INTEGER NOT NULL
      )`,
      `CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        course_code TEXT,
        status TEXT NOT NULL DEFAULT 'todo',
        priority TEXT NOT NULL DEFAULT 'medium',
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      )`,
      {
        sql: "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)",
        args: [7, "legacy@example.com", "legacy-test-hash"],
      },
      {
        sql: "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
        args: ["legacy-token", 7, 2000000000],
      },
      {
        sql:
          "INSERT INTO tasks (id, user_id, title, course_code, status, priority, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [42, 7, "Existing task", "SEN0415", "in-progress", "high", 1700000000],
      },
    ]);

    await migrate(database);
    await migrate(database);

    const [preservedUser] = await database.db.select().from(users);
    assertObjectMatch(preservedUser, {
      id: 7,
      email: "legacy@example.com",
      passwordHash: "legacy-test-hash",
    });

    const sessions = await database.client.execute("SELECT * FROM sessions");
    assertEquals(sessions.rows.length, 1);
    assertObjectMatch(sessions.rows[0], {
      token: "legacy-token",
      user_id: 7,
      expires_at: 2000000000,
    });

    const [preservedTask] = await database.db.select().from(tasks);
    assertObjectMatch(preservedTask, {
      id: 42,
      userId: 7,
      title: "Existing task",
      courseCode: "SEN0415",
      dueDate: null,
      status: "in-progress",
      priority: "high",
      createdAt: 1700000000,
    });
  } finally {
    database.client.close();
  }
});
