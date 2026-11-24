// STUDENT NAME, STUDENT NUMBER
import bcrypt from "bcryptjs";
import type { Db } from "./db.ts";
import type { MiddlewareHandler } from "hono";
export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
export const checkPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

const SESSION_SECONDS = 60 * 60; // a session lives for one hour

/** Log a user in: store a random token for them and return it. */
export async function createSession(db: Db, userId: number): Promise<string> {
  const token = crypto.randomUUID();
  await db.client.execute({
    sql:
      "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, strftime('%s','now') + ?)",
    args: [token, userId, SESSION_SECONDS],
  });
  return token;
}

/** Return the user id that owns a valid, unexpired token, or null. */
export async function userIdFromToken(db: Db, token: string): Promise<number | null> {
  const res = await db.client.execute({
    sql:
      "SELECT user_id FROM sessions WHERE token = ? AND expires_at > strftime('%s','now')",
    args: [token],
  });
  const id = res.rows[0]?.user_id;
  return id === undefined ? null : Number(id);
}

export type Env = {
  Variables: {
    userId: number;
  };
};

export function requireAuth(database: Db): MiddlewareHandler<Env> {
  return async (c, next) => {
    const authorization = c.req.header("authorization") ?? "";
    const token = authorization.match(/^Bearer (\S+)$/i)?.[1];

    const userId = token ? await userIdFromToken(database, token) : null;

    if (userId === null) {
      return c.json({
        error: "unauthorized",
        issues: [],
      }, 401);
    }

    c.set("userId", userId);
    await next();
  };
}
// answers 401 when it is missing or unknown (use userIdFromToken), and otherwise stores the
// user id with c.set("userId", id) so that the routes can use it.
