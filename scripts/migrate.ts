// Mehmet Mert Seyhan, 2300007247
import { createDb, migrate } from "../src/db.ts";

const database = createDb(Deno.env.get("DATABASE_URL") ?? "file:./tasks.db");

try {
  await migrate(database);
  console.log("Database migrations applied.");
} finally {
  database.client.close();
}
