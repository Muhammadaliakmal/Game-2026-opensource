import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { runs, worlds } from "@/lib/db/schema";
import { isBuiltInWorld } from "@/lib/built-in-worlds";
import { isUuid } from "@/lib/ids";

/**
 * GET /api/worlds/:id/runs/ghost — one replay to race against.
 *
 * Its own route rather than a field on the board, because a ghost is by far
 * the largest thing in the table and exactly one of them is ever watched. The
 * board is a list of names and times that a page renders immediately; this is
 * a few tens of kilobytes fetched once, in the background, for the one runner
 * the player chose to chase.
 *
 * `?who=me` returns the caller's own best instead of the record — which is the
 * version most players actually want, because the thing worth chasing on your
 * fourth attempt is your third one, not a stranger four medals ahead.
 */

type Params = { params: Promise<{ id: string }> };

async function readable(id: string, userId: string | null): Promise<boolean> {
  if (isBuiltInWorld(id)) return true;
  if (!isUuid(id)) return false;
  const [row] = await db
    .select({ ownerId: worlds.ownerId, published: worlds.published })
    .from(worlds)
    .where(eq(worlds.id, id));
  if (!row) return false;
  return row.published === 1 || row.ownerId === userId;
}

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const { userId } = await auth();

  if (!(await readable(id, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const who = new URL(req.url).searchParams.get("who") ?? "best";
  const mine = who === "me";
  if (mine && !userId) {
    // Not an error: a signed-out player has no stored run, and the client's
    // answer to "no ghost" is the same either way — race nobody.
    return NextResponse.json({ ghost: null, name: null, timeMs: null });
  }

  /*
   * `?who=user:<id>` is somebody else's best — the run behind a "beat my
   * time" link. Their id is already public on every board row, and what it
   * yields is a replay on a course the caller can read anyway, so there is
   * nothing here to guard beyond the world check above. An unknown id is a
   * missing ghost, not an error: the link may outlive the run.
   */
  const target = who.startsWith("user:") ? who.slice(5) : null;
  if (target !== null && !/^[\w-]{1,64}$/.test(target)) {
    return NextResponse.json({ ghost: null, name: null, timeMs: null });
  }

  const [row] = await db
    .select({ name: runs.name, timeMs: runs.timeMs, ghost: runs.ghost })
    .from(runs)
    .where(
      mine
        ? and(eq(runs.worldId, id), eq(runs.userId, userId!))
        : target !== null
          ? and(eq(runs.worldId, id), eq(runs.userId, target))
          : and(eq(runs.worldId, id), isNotNull(runs.ghost))
    )
    .orderBy(asc(runs.timeMs))
    .limit(1);

  if (!row?.ghost) {
    return NextResponse.json({ ghost: null, name: null, timeMs: null });
  }
  return NextResponse.json({
    ghost: row.ghost,
    name: row.name,
    timeMs: row.timeMs,
  });
}
