//Mehmet Mert Seyhan
//2300007247
import { Hono } from "hono";
import { z } from "zod";
import { checkPassword, createSession, hashPassword, requireAuth } from "./auth.ts";
import type { Env } from "./auth.ts";
import type { Db } from "./db.ts";
import { tasks, users } from "./schema.ts";
import { and, asc, count, eq } from "drizzle-orm";
const Credentials = z.object({
  email: z.email(),
  password: z.string().min(8),
});
const TaskInput = z.object({
  title: z.string().trim().min(1).max(100),
  courseCode: z.string().trim().min(1).max(20).nullable().default(null),
  dueDate: z.iso.date().nullable().default(null),
  status: z.enum(["todo", "in-progress", "done"]).default("todo"),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
});
const TaskQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["todo", "in-progress", "done"]).optional(),
});
const TaskId = z.object({
  id: z.coerce.number().int().min(1),
});

const ownTask = (id: number, userId: number) =>
  and(eq(tasks.id, id), eq(tasks.userId, userId));
export function createApp(database: Db) {
  const app = new Hono<Env>();
  app.use("/api/*", requireAuth(database));
  app.onError((error, c) => {
    console.error("Unhandled API error:", error);

    return c.json({
      error: "internal server error",
      issues: [],
    }, 500);
  });

  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/auth/register", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = Credentials.safeParse(body);

    if (!parsed.success) {
      return c.json({
        error: "validation failed",
        issues: parsed.error.issues,
      }, 400);
    }

    const { email, password } = parsed.data;
    const passwordHash = await hashPassword(password);

    const [user] = await database.db.insert(users).values({
      email,
      passwordHash,
    }).onConflictDoNothing({ target: users.email })
      .returning({
        id: users.id,
        email: users.email,
      });

    if (!user) {
      return c.json({
        error: "email already registered",
        issues: [],
      }, 409);
    }

    return c.json(user, 201);
  });

  // TODO: login and authentication middleware.
  // TODO: task routes and remaining error handling.
  app.post("/auth/login", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = Credentials.safeParse(body);

    if (!parsed.success) {
      return c.json({
        error: "validation failed",
        issues: parsed.error.issues,
      }, 400);
    }

    const { email, password } = parsed.data;

    const [user] = await database.db.select()
      .from(users)
      .where(eq(users.email, email));

    if (!user || !(await checkPassword(password, user.passwordHash))) {
      return c.json({
        error: "invalid email or password",
        issues: [],
      }, 401);
    }

    const token = await createSession(database, user.id);

    return c.json({ token }, 200);
  });
  app.post("/api/tasks", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = TaskInput.safeParse(body);

    if (!parsed.success) {
      return c.json({
        error: "validation failed",
        issues: parsed.error.issues,
      }, 400);
    }

    const [task] = await database.db.insert(tasks).values({
      ...parsed.data,
      userId: c.get("userId"),
    }).returning();

    return c.json(task, 201);
  });
  app.get("/api/tasks", async (c) => {
    const parsed = TaskQuery.safeParse(c.req.query());

    if (!parsed.success) {
      return c.json({
        error: "validation failed",
        issues: parsed.error.issues,
      }, 400);
    }

    const { page, limit, status } = parsed.data;
    const userId = c.get("userId");

    const condition = and(
      eq(tasks.userId, userId),
      status === undefined ? undefined : eq(tasks.status, status),
    );

    const items = await database.db.select()
      .from(tasks)
      .where(condition)
      .orderBy(asc(tasks.id))
      .limit(limit)
      .offset((page - 1) * limit);

    const [summary] = await database.db.select({
      total: count(),
    }).from(tasks).where(condition);

    return c.json({
      items,
      page,
      limit,
      total: summary?.total ?? 0,
    });
  });
  app.get("/api/tasks/:id", async (c) => {
    const parsed = TaskId.safeParse(c.req.param());

    if (!parsed.success) {
      return c.json({
        error: "validation failed",
        issues: parsed.error.issues,
      }, 400);
    }

    const [task] = await database.db.select()
      .from(tasks)
      .where(ownTask(parsed.data.id, c.get("userId")));

    if (!task) {
      return c.json({
        error: "task not found",
        issues: [],
      }, 404);
    }

    return c.json(task, 200);
  });
  app.put("/api/tasks/:id", async (c) => {
    const parsedId = TaskId.safeParse(c.req.param());

    if (!parsedId.success) {
      return c.json({
        error: "validation failed",
        issues: parsedId.error.issues,
      }, 400);
    }

    const body = await c.req.json().catch(() => null);
    const parsedBody = TaskInput.safeParse(body);

    if (!parsedBody.success) {
      return c.json({
        error: "validation failed",
        issues: parsedBody.error.issues,
      }, 400);
    }

    const [task] = await database.db.update(tasks)
      .set(parsedBody.data)
      .where(ownTask(parsedId.data.id, c.get("userId")))
      .returning();

    if (!task) {
      return c.json({
        error: "task not found",
        issues: [],
      }, 404);
    }

    return c.json(task, 200);
  });
  app.delete("/api/tasks/:id", async (c) => {
    const parsed = TaskId.safeParse(c.req.param());

    if (!parsed.success) {
      return c.json({
        error: "validation failed",
        issues: parsed.error.issues,
      }, 400);
    }

    const [deleted] = await database.db.delete(tasks)
      .where(ownTask(parsed.data.id, c.get("userId")))
      .returning({ id: tasks.id });

    if (!deleted) {
      return c.json({
        error: "task not found",
        issues: [],
      }, 404);
    }

    return c.json({ ok: true }, 200);
  });
  app.notFound((c) => c.json({ error: "not found", issues: [] }, 404));

  return app;
}
