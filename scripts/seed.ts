import "./env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import type { Db } from "../src/db/types";
import { demoToday } from "../src/lib/clock";
import { seedDemo } from "../src/seed/seed";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não configurada (veja .env.example)");
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const db = drizzle(pool, { schema }) as unknown as Db;
    const counts = await seedDemo(db, { demoToday: demoToday(), appUrl: process.env.APP_URL, reason: "npm run db:seed" });
    console.log(`Base de demonstração recriada (DEMO_TODAY ${demoToday()}):`, counts);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
