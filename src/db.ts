// Mehmet Mert Seyhan, 2300007247
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/libsql";
import { migrate as applyMigrations } from "drizzle-orm/libsql/migrator";
import { createClient } from "@libsql/client";
import * as schema from "./schema.ts";

export type Db = ReturnType<typeof createDb>;

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

/** Open a database. Tests pass "file::memory:" or a temporary file. */
export function createDb(url: string) {
  const client = createClient({ url });
  const db = drizzle(client, { schema });
  return { db, client };
}

/** Apply pending generated SQL migrations; Drizzle records completed migrations. */
export async function migrate({ db }: Db) {
  await applyMigrations(db, { migrationsFolder });
}
