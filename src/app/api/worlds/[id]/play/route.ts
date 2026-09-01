import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { worlds } from "@/lib/db/schema";
import { isBuiltInWorld } from "@/lib/built-in-worlds";
import { isUuid } from "@/lib/ids";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/worlds/:id/play — record a play.
 *
 * Deliberately not folded into GET: a read shouldn't have a write side effect,
 * and the editor's own load would inflate the count. It's fire-and-forget from
 * the client, so failures are silent by design — a lost count is not worth
 * interrupting someone's game over.
 *
 * The count is a public popularity signal, not analytics: no identity is
 * stored, which keeps it clear of the COPPA/AADC profiling constraints in
 * SPEC §10.
 */
export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;

  // Built-ins have no row to count against.
  if (isBuiltInWorld(id)) return NextResponse.json({ ok: true });
  // A non-uuid id is a Postgres type error, not a miss — and this endpoint is
  // fire-and-forget, so it must never be the thing that throws a 500.
  if (!isUuid(id)) return NextResponse.json({ ok: true });

  const { userId } = await auth();

  // Increment atomically in SQL rather than read-modify-write, and skip the
  // owner so replaying your own world doesn't manufacture popularity.
  await db
    .update(worlds)
    .set({ playCount: sql`${worlds.playCount} + 1` })
    .where(
      and(
        eq(worlds.id, id),
        eq(worlds.published, 1),
        userId ? ne(worlds.ownerId, userId) : undefined
      )
    );

  return NextResponse.json({ ok: true });
}
