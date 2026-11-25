# Tasks API

Name: Mehmet Mert Seyhan\
Student number: 2300007247

This Deno project extends the course starter with authentication and private task
management. Implementation, explanations and debugging were developed with AI assistance.
The commands and verification results recorded below come from actual runs.

## Run it

    cp .env.example .env
    deno task dev        # API on http://localhost:8000
    deno task test       # all tests
    deno task check      # type-check

## Try it in a browser (given, not graded)

`ui/` is a small React page that calls your API (log in, add, advance and delete tasks).
Start the API first, then in a second terminal:

    deno task ui:install   # once
    deno task ui:dev       # UI on http://localhost:5173

The UI uses your routes exactly as described in the handout, so it starts to work as soon
as register, login and the task routes do.

## Design decisions (R8)

`users` stores an email and bcrypt password hash. `sessions` maps a random token to a user
and its expiry time. `tasks` references its owner and stores its title, status, priority
and creation time. Optional `courseCode` associates a task with a course; optional
`dueDate` stores a calendar date as `YYYY-MM-DD`. Omitted optional fields are `null`.
Creation timestamps come from SQLite defaults.

Protected routes obtain the owner from the authenticated session. Reading, updating and
deleting one task constrain the query by both task id and user id. Another user's task
therefore produces the same 404 as a missing task. Lists apply the same owner condition,
sort by id and return pagination metadata with a filtered total.

POST and PUT share a Zod body schema. PUT requires a title; omitted status and priority
use their defaults, and omitted course code and due date become `null`. Errors share the
`{ error, issues }` shape.

## API with curl (R8)

One working `curl` command with its real output for every route.

## My own log (R8)

At least five real things that went wrong or surprised you, with the exact error message.

## Bonus 1: Migrations with Drizzle Kit

Drizzle Kit reads `src/schema.ts` through `drizzle.config.ts`. The first generated file,
`drizzle/0000_initial_schema.sql`, describes the users, sessions and tasks tables,
including the optional course code. A real second change added nullable
`dueDate: text("due_date")` to the task schema. Running the generator again produced
`drizzle/0001_add_task_due_date.sql`:

```sql
ALTER TABLE `tasks` ADD `due_date` text;
```

The generation commands used were:

```powershell
deno task db:generate --name=initial_schema
deno task db:generate --name=add_task_due_date
deno fmt drizzle/meta
```

`src/db.ts` now delegates to the libSQL Drizzle migrator instead of executing hand-written
table SQL. `src/main.ts` already calls this function before starting the API, so startup
applies pending files automatically. The migration directory is resolved relative to the
module, rather than the terminal's working directory. The Node-compatible URL helper used
for this path runs inside Deno; Node.js is not required.

Migrations can also be applied explicitly:

```powershell
deno task db:migrate
```

Actual output:

```text
Task db:migrate deno run -A scripts/migrate.ts
Database migrations applied.
```

For the transition from the starter database, the existing `course_code` update was
applied first. Before the initial generated migration was applied, its `CREATE
TABLE` and
`CREATE UNIQUE INDEX` statements were adjusted with `IF NOT EXISTS` so existing tables and
records were retained. The second migration remains the generated `ALTER TABLE`. Drizzle
records applied files in `__drizzle_migrations`. The local database retained its 2 users,
1 session and 1 task, and now records 2 completed migrations.

Tests cover a fresh database, preserving records from the previous schema, running
migrations twice without repeating them, and due-date persistence and validation. After
this change, all 38 tests passed.
