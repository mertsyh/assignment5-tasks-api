//Mehmet Mert Seyhan
//2300007247
import { assert, assertEquals, assertObjectMatch } from "@std/assert";
import { freshApp } from "./helpers.ts";

async function authenticatedApp(
  email = "owner@example.com",
  existingApp?: Awaited<ReturnType<typeof freshApp>>,
) {
  const app = existingApp ?? await freshApp();

  const credentials = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "test-password-123",
    }),
  };

  const registration = await app.request("/auth/register", credentials);
  assertEquals(registration.status, 201);

  const login = await app.request("/auth/login", credentials);
  assertEquals(login.status, 200);

  const body: unknown = await login.json();
  assert(body !== null && typeof body === "object");
  assert("token" in body);
  assert(typeof body.token === "string");

  return { app, token: body.token };
}
async function createTask(
  app: Awaited<ReturnType<typeof freshApp>>,
  token: string,
  title = "Original task",
) {
  const response = await app.request("/api/tasks", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ title }),
  });

  assertEquals(response.status, 201);

  const body: unknown = await response.json();

  assert(body !== null && typeof body === "object");
  assert("id" in body && typeof body.id === "number");

  return body.id;
}
Deno.test("creating a task requires a token", async () => {
  const app = await freshApp();

  const response = await app.request("/api/tasks", {
    method: "POST",
  });

  assertEquals(response.status, 401);
  assertEquals(await response.json(), {
    error: "unauthorized",
    issues: [],
  });
});

Deno.test("creating a task rejects an unknown token", async () => {
  const app = await freshApp();

  const response = await app.request("/api/tasks", {
    method: "POST",
    headers: { authorization: "Bearer invalid-token" },
  });

  assertEquals(response.status, 401);
  assertEquals(await response.json(), {
    error: "unauthorized",
    issues: [],
  });
});

Deno.test("creating a task sets the owner and default values", async () => {
  const { app, token } = await authenticatedApp();

  const response = await app.request("/api/tasks", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title: "Review database notes",
    }),
  });

  assertEquals(response.status, 201);
  assertObjectMatch(await response.json(), {
    id: 1,
    userId: 1,
    title: "Review database notes",
    status: "todo",
    priority: "medium",
  });
});

Deno.test("creating a task rejects an invalid status", async () => {
  const { app, token } = await authenticatedApp();

  const response = await app.request("/api/tasks", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title: "Review database notes",
      status: "finished",
    }),
  });

  assertEquals(response.status, 400);
  assertObjectMatch(await response.json(), {
    error: "validation failed",
  });
});

Deno.test("listing tasks returns an empty page with default values", async () => {
  const { app, token } = await authenticatedApp();

  const response = await app.request("/api/tasks", {
    headers: { authorization: `Bearer ${token}` },
  });

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    items: [],
    page: 1,
    limit: 20,
    total: 0,
  });
});

Deno.test("listing tasks returns the correct items on page two", async () => {
  const { app, token } = await authenticatedApp();

  for (let number = 1; number <= 5; number++) {
    const created = await app.request("/api/tasks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: `Task ${number}` }),
    });

    assertEquals(created.status, 201);
  }

  const response = await app.request("/api/tasks?page=2&limit=2", {
    headers: { authorization: `Bearer ${token}` },
  });

  assertEquals(response.status, 200);

  const body: unknown = await response.json();

  assert(body !== null && typeof body === "object");
  assert("items" in body && Array.isArray(body.items));

  assertObjectMatch(body, {
    page: 2,
    limit: 2,
    total: 5,
  });

  assertEquals(body.items.length, 2);
  assertObjectMatch(body.items[0], { id: 3, title: "Task 3" });
  assertObjectMatch(body.items[1], { id: 4, title: "Task 4" });
});

Deno.test("listing tasks filters items and total by status", async () => {
  const { app, token } = await authenticatedApp();

  for (const status of ["todo", "done", "in-progress", "done"]) {
    const created = await app.request("/api/tasks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: `Task with status ${status}`,
        status,
      }),
    });

    assertEquals(created.status, 201);
  }

  const response = await app.request("/api/tasks?status=done", {
    headers: { authorization: `Bearer ${token}` },
  });

  assertEquals(response.status, 200);

  const body: unknown = await response.json();

  assert(body !== null && typeof body === "object");
  assert("items" in body && Array.isArray(body.items));

  assertObjectMatch(body, {
    page: 1,
    limit: 20,
    total: 2,
  });

  assertEquals(body.items.length, 2);
  assertObjectMatch(body.items[0], { id: 2, status: "done" });
  assertObjectMatch(body.items[1], { id: 4, status: "done" });
});

Deno.test("each user lists only their own tasks", async () => {
  const { app, token: firstToken } = await authenticatedApp();

  const secondCredentials = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "second@example.com",
      password: "test-password-123",
    }),
  };

  const registration = await app.request(
    "/auth/register",
    secondCredentials,
  );
  assertEquals(registration.status, 201);

  const login = await app.request("/auth/login", secondCredentials);
  assertEquals(login.status, 200);

  const loginBody: unknown = await login.json();

  assert(loginBody !== null && typeof loginBody === "object");
  assert("token" in loginBody);
  assert(typeof loginBody.token === "string");

  const accounts = [
    { token: firstToken, title: "First user's task", userId: 1 },
    { token: loginBody.token, title: "Second user's task", userId: 2 },
  ];

  for (const account of accounts) {
    const created = await app.request("/api/tasks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${account.token}`,
      },
      body: JSON.stringify({ title: account.title }),
    });

    assertEquals(created.status, 201);
  }

  for (const account of accounts) {
    const response = await app.request("/api/tasks", {
      headers: {
        authorization: `Bearer ${account.token}`,
      },
    });

    assertEquals(response.status, 200);

    const body: unknown = await response.json();

    assert(body !== null && typeof body === "object");
    assert("items" in body && Array.isArray(body.items));

    assertObjectMatch(body, {
      page: 1,
      limit: 20,
      total: 1,
    });

    assertEquals(body.items.length, 1);
    assertObjectMatch(body.items[0], {
      title: account.title,
      userId: account.userId,
    });
  }
});

Deno.test("a user can read their own task", async () => {
  const { app, token } = await authenticatedApp();

  const created = await app.request("/api/tasks", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ title: "My private task" }),
  });

  assertEquals(created.status, 201);

  const response = await app.request("/api/tasks/1", {
    headers: { authorization: `Bearer ${token}` },
  });

  assertEquals(response.status, 200);
  assertObjectMatch(await response.json(), {
    id: 1,
    userId: 1,
    title: "My private task",
    status: "todo",
    priority: "medium",
  });
});

Deno.test("reading a missing task returns 404", async () => {
  const { app, token } = await authenticatedApp();

  const response = await app.request("/api/tasks/999", {
    headers: { authorization: `Bearer ${token}` },
  });

  assertEquals(response.status, 404);
  assertEquals(await response.json(), {
    error: "task not found",
    issues: [],
  });
});

Deno.test("a user cannot read another user's task", async () => {
  const { app, token: ownerToken } = await authenticatedApp();

  const created = await app.request("/api/tasks", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ownerToken}`,
    },
    body: JSON.stringify({ title: "Owner's private task" }),
  });

  assertEquals(created.status, 201);

  const { token: otherToken } = await authenticatedApp(
    "other@example.com",
    app,
  );

  const response = await app.request("/api/tasks/1", {
    headers: { authorization: `Bearer ${otherToken}` },
  });

  assertEquals(response.status, 404);
  assertEquals(await response.json(), {
    error: "task not found",
    issues: [],
  });
});

Deno.test("updating a task saves the new values", async () => {
  const { app, token } = await authenticatedApp();
  const id = await createTask(app, token);

  const updatedValues = {
    title: "Updated task",
    status: "done",
    priority: "high",
  };

  const response = await app.request(`/api/tasks/${id}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(updatedValues),
  });

  assertEquals(response.status, 200);
  assertObjectMatch(await response.json(), updatedValues);

  const saved = await app.request(`/api/tasks/${id}`, {
    headers: { authorization: `Bearer ${token}` },
  });

  assertEquals(saved.status, 200);
  assertObjectMatch(await saved.json(), updatedValues);
});

Deno.test("updating a missing task returns 404", async () => {
  const { app, token } = await authenticatedApp();

  const response = await app.request("/api/tasks/999", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ title: "Updated task" }),
  });

  assertEquals(response.status, 404);
  assertEquals(await response.json(), {
    error: "task not found",
    issues: [],
  });
});

Deno.test("a user cannot update another user's task", async () => {
  const { app, token: ownerToken } = await authenticatedApp();
  const id = await createTask(app, ownerToken);

  const { token: otherToken } = await authenticatedApp(
    "other@example.com",
    app,
  );

  const response = await app.request(`/api/tasks/${id}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${otherToken}`,
    },
    body: JSON.stringify({
      title: "Unauthorized change",
      status: "done",
      priority: "high",
    }),
  });

  assertEquals(response.status, 404);

  const original = await app.request(`/api/tasks/${id}`, {
    headers: { authorization: `Bearer ${ownerToken}` },
  });

  assertEquals(original.status, 200);
  assertObjectMatch(await original.json(), {
    title: "Original task",
    status: "todo",
    priority: "medium",
  });
});

Deno.test("updating a task rejects an empty title", async () => {
  const { app, token } = await authenticatedApp();
  const id = await createTask(app, token);

  const response = await app.request(`/api/tasks/${id}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ title: "" }),
  });

  assertEquals(response.status, 400);
  assertObjectMatch(await response.json(), {
    error: "validation failed",
  });
});

Deno.test("deleting a task removes it", async () => {
  const { app, token } = await authenticatedApp();
  const id = await createTask(app, token);

  const response = await app.request(`/api/tasks/${id}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { ok: true });

  const readAfterDelete = await app.request(`/api/tasks/${id}`, {
    headers: { authorization: `Bearer ${token}` },
  });

  assertEquals(readAfterDelete.status, 404);
});

Deno.test("deleting a missing task returns 404", async () => {
  const { app, token } = await authenticatedApp();

  const response = await app.request("/api/tasks/999", {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });

  assertEquals(response.status, 404);
  assertEquals(await response.json(), {
    error: "task not found",
    issues: [],
  });
});

Deno.test("a user cannot delete another user's task", async () => {
  const { app, token: ownerToken } = await authenticatedApp();
  const id = await createTask(app, ownerToken);

  const { token: otherToken } = await authenticatedApp(
    "other@example.com",
    app,
  );

  const response = await app.request(`/api/tasks/${id}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${otherToken}` },
  });

  assertEquals(response.status, 404);

  const original = await app.request(`/api/tasks/${id}`, {
    headers: { authorization: `Bearer ${ownerToken}` },
  });

  assertEquals(original.status, 200);
  assertObjectMatch(await original.json(), {
    id,
    title: "Original task",
    userId: 1,
  });
});
Deno.test("listing tasks rejects invalid query values", async () => {
  const { app, token } = await authenticatedApp();

  const queries = [
    "page=0",
    "page=-1",
    "page=abc",
    "page=1.5",
    "limit=0",
    "limit=101",
    "limit=abc",
    "status=finished",
  ];

  for (const query of queries) {
    const response = await app.request(`/api/tasks?${query}`, {
      headers: { authorization: `Bearer ${token}` },
    });

    assertEquals(response.status, 400, query);
    assertObjectMatch(await response.json(), {
      error: "validation failed",
    });
  }
});

Deno.test("task routes reject invalid task ids", async () => {
  const { app, token } = await authenticatedApp();

  for (const id of ["abc", "0", "-1", "1.5"]) {
    for (const method of ["GET", "PUT", "DELETE"]) {
      const response = await app.request(`/api/tasks/${id}`, {
        method,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: method === "PUT" ? JSON.stringify({ title: "Updated task" }) : undefined,
      });

      assertEquals(response.status, 400, `${method} with id ${id}`);
      assertObjectMatch(await response.json(), {
        error: "validation failed",
      });
    }
  }
});

Deno.test("body endpoints reject malformed JSON", async () => {
  const { app, token } = await authenticatedApp();
  const id = await createTask(app, token);

  const requests = [
    { path: "/auth/register", method: "POST" },
    { path: "/auth/login", method: "POST" },
    { path: "/api/tasks", method: "POST" },
    { path: `/api/tasks/${id}`, method: "PUT" },
  ];

  for (const request of requests) {
    const response = await app.request(request.path, {
      method: request.method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: '{"title":',
    });

    assertEquals(response.status, 400, request.path);
    assertObjectMatch(await response.json(), {
      error: "validation failed",
    });
  }
});

Deno.test("an unknown route returns the common error shape", async () => {
  const app = await freshApp();

  const response = await app.request("/does-not-exist");

  assertEquals(response.status, 404);
  assertEquals(await response.json(), {
    error: "not found",
    issues: [],
  });
});

Deno.test("courseCode is saved and can be updated", async () => {
  const { app, token } = await authenticatedApp();

  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
  };

  const created = await app.request("/api/tasks", {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "Finish the assignment",
      courseCode: "  SEN0415  ",
    }),
  });

  assertEquals(created.status, 201);

  const createdBody: unknown = await created.json();
  assert(createdBody !== null && typeof createdBody === "object");
  assert("id" in createdBody && typeof createdBody.id === "number");
  assertObjectMatch(createdBody, { courseCode: "SEN0415" });

  const path = `/api/tasks/${createdBody.id}`;
  const saved = await app.request(path, { headers });

  assertEquals(saved.status, 200);
  assertObjectMatch(await saved.json(), { courseCode: "SEN0415" });

  const updated = await app.request(path, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      title: "Finish the assignment",
      courseCode: "SEN0416",
    }),
  });

  assertEquals(updated.status, 200);
  assertObjectMatch(await updated.json(), { courseCode: "SEN0416" });

  const readAfterUpdate = await app.request(path, { headers });

  assertEquals(readAfterUpdate.status, 200);
  assertObjectMatch(await readAfterUpdate.json(), { courseCode: "SEN0416" });
});

Deno.test("courseCode defaults to null when omitted", async () => {
  const { app, token } = await authenticatedApp();
  const id = await createTask(app, token);

  const response = await app.request(`/api/tasks/${id}`, {
    headers: { authorization: `Bearer ${token}` },
  });

  assertEquals(response.status, 200);
  assertObjectMatch(await response.json(), { courseCode: null });
});

Deno.test("creating a task rejects invalid course codes", async () => {
  const { app, token } = await authenticatedApp();

  for (const courseCode of ["", "   ", "X".repeat(21), 42]) {
    const response = await app.request("/api/tasks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: "Finish the assignment",
        courseCode,
      }),
    });

    assertEquals(response.status, 400, JSON.stringify(courseCode));
    assertObjectMatch(await response.json(), { error: "validation failed" });
  }

  const listed = await app.request("/api/tasks", {
    headers: { authorization: `Bearer ${token}` },
  });

  assertEquals(listed.status, 200);
  assertEquals(await listed.json(), {
    items: [],
    page: 1,
    limit: 20,
    total: 0,
  });
});
