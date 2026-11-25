import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import type { Db } from "./types";

const globalForDb = globalThis as unknown as { __cbsPool?: Pool; __cbsDb?: Db };

export function getDb(): Db {
  if (globalForDb.__cbsDb) return globalForDb.__cbsDb;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não configurada");
  const pool = globalForDb.__cbsPool ?? new Pool({ connectionString, max: 5 });
  globalForDb.__cbsPool = pool;
  globalForDb.__cbsDb = drizzle(pool, { schema }) as unknown as Db;
  return globalForDb.__cbsDb;
}
