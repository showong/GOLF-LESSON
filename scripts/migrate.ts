import fs from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL 환경 변수가 필요합니다.");
  const pool = new Pool({
    connectionString,
    ...(process.env.PG_SSL === "require"
      ? { ssl: { rejectUnauthorized: false } }
      : {}),
  });
  const client = await pool.connect();
  try {
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    );
    const migrationDir = path.join(process.cwd(), "migrations");
    const files = (await fs.readdir(migrationDir))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const name of files) {
      const applied = await client.query(
        "SELECT name FROM schema_migrations WHERE name = $1",
        [name],
      );
      if (applied.rowCount) continue;
      await client.query("BEGIN");
      try {
        await client.query(await fs.readFile(path.join(migrationDir, name), "utf8"));
        await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [name]);
        await client.query("COMMIT");
        console.log(`applied ${name}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
