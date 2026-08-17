import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;
let cachedPool: Pool | null = null;

function createPool(): Pool {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PGPOOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: process.env.PGSSL === "require" ? { rejectUnauthorized: true } : undefined,
  });
  // Without this, a dropped idle connection (DB restart, network blip) throws
  // an uncaught "error" event on the Pool and crashes the whole Node process.
  pool.on("error", (err) => {
    console.error("[pg] idle client error", err);
  });
  return pool;
}

export function getPool(): Pool {
  if (cachedPool) return cachedPool;
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and configure it.");
  }
  cachedPool = createPool();
  return cachedPool;
}

export function getDb() {
  if (cachedDb) return cachedDb;
  cachedDb = drizzle(getPool(), { schema });
  return cachedDb;
}

export async function closePool(): Promise<void> {
  if (cachedPool) await cachedPool.end();
  cachedPool = null;
  cachedDb = null;
}
