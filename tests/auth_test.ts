//Mehmet Mert Seyhan
//2300007247
import { assert, assertEquals, assertObjectMatch } from "@std/assert";
import { freshApp } from "./helpers.ts";

const registration = {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: "student@example.com",
    password: "test-password-123",
  }),
};

Deno.test("register creates a user without exposing the password hash", async () => {
  const app = await freshApp();

  const response = await app.request("/auth/register", registration);

  assertEquals(response.status, 201);
  assertEquals(await response.json(), {
    id: 1,
    email: "student@example.com",
  });
});

Deno.test("register rejects a duplicate email", async () => {
  const app = await freshApp();

  const first = await app.request("/auth/register", registration);
  assertEquals(first.status, 201);

  const second = await app.request("/auth/register", registration);

  assertEquals(second.status, 409);
  assertEquals(await second.json(), {
    error: "email already registered",
    issues: [],
  });
});

Deno.test("register rejects an invalid email and a short password", async () => {
  const app = await freshApp();

  const response = await app.request("/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "invalid-email",
      password: "123",
    }),
  });

  assertEquals(response.status, 400);
  assertObjectMatch(await response.json(), {
    error: "validation failed",
  });
});

Deno.test("login returns a token for valid credentials", async () => {
  const app = await freshApp();

  await app.request("/auth/register", registration);

  const response = await app.request("/auth/login", registration);

  assertEquals(response.status, 200);

  const body: unknown = await response.json();

  assert(body !== null && typeof body === "object");
  assert("token" in body);
  assert(typeof body.token === "string" && body.token.length > 0);
});

Deno.test("login rejects a wrong password", async () => {
  const app = await freshApp();

  await app.request("/auth/register", registration);

  const response = await app.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "student@example.com",
      password: "incorrect-password",
    }),
  });

  assertEquals(response.status, 401);
  assertEquals(await response.json(), {
    error: "invalid email or password",
    issues: [],
  });
});

Deno.test("login rejects an unknown email with the same error", async () => {
  const app = await freshApp();

  const response = await app.request("/auth/login", registration);

  assertEquals(response.status, 401);
  assertEquals(await response.json(), {
    error: "invalid email or password",
    issues: [],
  });
});
