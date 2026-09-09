// app code (Vercel serverless / edge): HTTP driver — no long-lived TCP, no pooling headaches.
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

/**
 * The database handle, connected on first use rather than on import.
 *
 * `neon()` validates the connection string the moment it is called, so doing
 * it at module scope made importing this file — for any reason — an assertion
 * that DATABASE_URL is set right now. Next's build does exactly that import:
 * "Collecting page data" evaluates every route module to read its config
 * exports, with no request in flight and, on a Vercel build, frequently
 * without runtime-only environment variables. The result was a build that
 * failed on a variable the deployed app would have had.
 *
 * Deferring the call moves that requirement to where it belongs — the first
 * query, which only ever happens while serving a request. A missing
 * DATABASE_URL then fails that one route with a legible message instead of
 * taking down the build, and pages that never touch the database (the
 * download page, privacy, the static shell) stop caring about it at all.
 *
 * The Proxy exists so callers keep writing `db.select(...)`: it forwards every
 * property access to the real handle, building it once on the first one.
 */
type Db = NeonHttpDatabase<typeof schema>;

let handle: Db | null = null;

function connect(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local for local " +
        "work, or add it to the Vercel project's environment variables."
    );
  }
  return drizzle(neon(url), { schema });
}

export const db = new Proxy({} as Db, {
  get(_target, prop) {
    handle ??= connect();
    // `handle` is the receiver so drizzle's methods keep their own `this`.
    return Reflect.get(handle, prop, handle);
  },
}) as Db;
