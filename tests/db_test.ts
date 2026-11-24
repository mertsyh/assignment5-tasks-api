//Mehmet Mert Seyhan
//2300007247
import { assert, assertEquals } from "@std/assert";
import { eq } from "drizzle-orm";
import { hashPassword } from "../src/auth.ts";
import { createDb, migrate } from "../src/db.ts";
import { tasks, users } from "../src/schema.ts";

Deno.test("a task is saved with its owner and default values", async () => {
  const directory = await Deno.makeTempDir();
  const database = createDb(`file:${directory}/tasks.db`);

  try {
    await migrate(database);

    const [user] = await database.db.insert(users).values({
      email: "student@example.com",
      passwordHash: await hashPassword("test-password-123"),
    }).returning({ id: users.id });

    assert(user);

    await database.db.insert(tasks).values({
      userId: user.id,
      title: "Review database notes",
    });

    const [task] = await database.db.select()
      .from(tasks)
      .where(eq(tasks.userId, user.id));

    assert(task);
    assertEquals(task.title, "Review database notes");
    assertEquals(task.userId, user.id);
    assertEquals(task.status, "todo");
    assertEquals(task.priority, "medium");
    assert(Number.isInteger(task.id) && task.id > 0);
    assert(Number.isInteger(task.createdAt) && task.createdAt > 0);
  } finally {
    database.client.close();
  }
});
