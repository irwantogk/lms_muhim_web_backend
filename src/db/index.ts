import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.ts";

// Pastikan kolom DATE & TIME dikembalikan sebagai string ('YYYY-MM-DD' / 'HH:MM:SS')
// agar hasil query deterministik tanpa parsing zona waktu.
pg.types.setTypeParser(1082, (value) => value); // DATE
pg.types.setTypeParser(1083, (value) => value); // TIME

const { Pool } = pg;

const connectionString = process.env["DATABASE_URL"] ??
  "postgres://lms:lms@localhost:5432/lms";

export const pool = new Pool({ connectionString });

export type Database = NodePgDatabase<typeof schema>;

export const db: Database = drizzle(pool, { schema });
