import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

/**
 * Sem DATABASE_URL (ex.: Render sem Postgres) o servidor precisa continuar no ar:
 * só quem usa o banco recebe o erro, na hora do uso, e pode responder 503.
 */
export const hasDatabase = Boolean(process.env.DATABASE_URL);

const missing = () => {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
};
const unavailable = <T extends object>() =>
  new Proxy({} as T, { get: missing, apply: missing }) as T;

export const pool: pg.Pool = hasDatabase
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : unavailable<pg.Pool>();
export const db = hasDatabase ? drizzle(pool, { schema }) : unavailable<ReturnType<typeof drizzle<typeof schema>>>();

export * from "./schema";
