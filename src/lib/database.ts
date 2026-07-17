import fs from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

type QueryResult<T> = { rows: T[]; rowCount: number | null };
type QueryExecutor = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
};

let pool: Pool | null = null;
let localDb: PGlite | null = null;
let localReady: Promise<void> | null = null;

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function shouldUsePostgres() {
  return Boolean(process.env.DATABASE_URL);
}

function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL 환경 변수가 필요합니다.");
  pool = new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...(process.env.PG_SSL === "require"
      ? { ssl: { rejectUnauthorized: false } }
      : {}),
  });
  return pool;
}

async function migrateLocal(db: PGlite) {
  // 런타임 번들러가 migrations 디렉터리 밖까지 동적으로 추적하지 않도록
  // 로컬 자동 적용 목록은 명시적으로 관리한다. 운영 스크립트는 디렉터리를 직접 탐색한다.
  const migrations = [
    {
      name: "0001_deployment_foundation.sql",
      filePath: path.join(
        /*turbopackIgnore: true*/ process.cwd(),
        "migrations",
        "0001_deployment_foundation.sql",
      ),
    },
  ];
  await db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
  );
  for (const migration of migrations) {
    const applied = await db.query<{ name: string }>(
      "SELECT name FROM schema_migrations WHERE name = $1",
      [migration.name],
    );
    if (applied.rows.length > 0) continue;
    const sql = await fs.readFile(/*turbopackIgnore: true*/ migration.filePath, "utf8");
    // PGlite의 Node 파일/메모리 VFS는 여러 DDL을 감싼 초기 트랜잭션이 간헐적으로
    // 정체될 수 있다. 로컬 마이그레이션은 모두 IF NOT EXISTS로 멱등적이므로 순차 적용한다.
    // 운영 PostgreSQL 마이그레이션은 scripts/migrate.ts에서 트랜잭션으로 실행된다.
    await db.exec(sql);
    await db.query(
      "INSERT INTO schema_migrations(name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      [migration.name],
    );
  }
}

async function getLocalDb(): Promise<PGlite> {
  if (isProduction()) {
    throw new Error("프로덕션에서는 DATABASE_URL이 반드시 필요합니다.");
  }
  if (!localDb) {
    const dataDir = process.env.PGLITE_DATA_DIR ?? "./data/pglite";
    if (!dataDir.startsWith("memory://")) {
      await fs.mkdir(path.dirname(path.resolve(dataDir)), { recursive: true });
    }
    localDb = new PGlite(dataDir);
  }
  if (!localReady) {
    localReady = migrateLocal(localDb).catch((error) => {
      localReady = null;
      throw error;
    });
  }
  await localReady;
  return localDb;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<T>> {
  if (shouldUsePostgres()) {
    const result = await getPool().query<T>(text, values);
    return { rows: result.rows, rowCount: result.rowCount };
  }
  const result = await (await getLocalDb()).query<T>(text, values);
  return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
}

export async function withTransaction<T>(
  run: (db: QueryExecutor) => Promise<T>,
): Promise<T> {
  if (!shouldUsePostgres()) {
    const db = await getLocalDb();
    return db.transaction(async (tx) =>
      run({
        query: async <R extends QueryResultRow>(text: string, values: unknown[] = []) => {
          const result = await tx.query<R>(text, values);
          return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
        },
      }),
    );
  }

  const client: PoolClient = await getPool().connect();
  try {
    await client.query("BEGIN");
    const value = await run(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDatabase() {
  if (pool) await pool.end();
  if (localDb) await localDb.close();
  pool = null;
  localDb = null;
  localReady = null;
}
