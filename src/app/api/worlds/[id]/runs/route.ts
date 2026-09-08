import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { and, asc, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { runs, worlds } from "@/lib/db/schema";
import { isBuiltInWorld } from "@/lib/built-in-worlds";
import { isUuid } from "@/lib/ids";
import { ghostSchema } from "@/lib/ghost";
import {
  MAX_RUN_MS,
  authorMsFor,
  floorMs as shippedFloorMs,
  medalForAuthor,
} from "@/lib/medals";

/**
 * The leaderboard for one course.
 *
 * ── What is on offer, and what is not ────────────────────────────────────
 *
 * Global and personal best. Not friends boards: those need a social graph the
 * app does not have, for the same reason `BuildRoom.canEdit` has no
 * collaborator model — inventing one here would mean inventing permissions
 * nobody can grant or revoke.
 *
 * ── Signed in only, on the way in ────────────────────────────────────────
 *
 * A board entry is a claim about a person, so it needs a person. A signed-out
 * player still gets everything the run was worth on its own — the clock, the
 * medal, and a personal best in their browser (see `play/course.ts`) — they
 * simply do not appear on a list of names. Reading the board needs no account
 * at all: a board you have to sign up to look at is a board nobody looks at.
 */

type Params = { params: Promise<{ id: string }> };

/** How many rows a board shows. Ten is a screenful and a round number. */
const TOP_N = 10;
const MAX_N = 50;

const submission = z.object({
  timeMs: z.number().int().positive().max(MAX_RUN_MS),
  ghost: ghostSchema.nullish(),
});

/**
 * Whether runs may be posted against this id at all, and against what floor.
 *
 * A built-in slug is always raceable. A uuid has to be a world that exists and
 * that the caller can legitimately have played: published, or their own. A
 * private world belonging to somebody else must 404 rather than reveal that it
 * exists, which is the same rule the remix path in `POST /api/worlds` follows.
 *
 * It answers the floor at the same time because both callers need the row and
 * neither should read it twice. The two sources are the ones `authorMsFor`
 * names: a shipped course's floor is derived from the `AUTHOR_MS` table it was
 * measured into, and a player's course carries its own in a column the server
 * wrote the last time its document changed — see `lib/course-floor.ts`. Null
 * means "not a course", which a sandbox world genuinely is.
 */
async function raceable(
  id: string,
  userId: string | null
): Promise<{ floorMs: number | null } | null> {
  if (isBuiltInWorld(id)) return { floorMs: shippedFloorMs(id) };
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({
      ownerId: worlds.ownerId,
      published: worlds.published,
      floorMs: worlds.floorMs,
    })
    .from(worlds)
    .where(eq(worlds.id, id));
  if (!row) return null;
  if (row.published !== 1 && row.ownerId !== userId) return null;
  return { floorMs: row.floorMs };
}

/**
 * GET /api/worlds/:id/runs — the board, plus the caller's own standing.
 *
 * Ghosts are deliberately not in this response. They are the largest thing in
 * the table by an order of magnitude and the board draws none of them; the one
 * that is actually watched is fetched on its own from `runs/ghost`.
 */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const { userId } = await auth();

  const course = await raceable(id, userId);
  if (!course) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const asked = Number(url.searchParams.get("limit"));
  const limit =
    Number.isFinite(asked) && asked > 0 ? Math.min(MAX_N, Math.floor(asked)) : TOP_N;

  const columns = {
    userId: runs.userId,
    name: runs.name,
    timeMs: runs.timeMs,
    medal: runs.medal,
    hasGhost: sql<boolean>`${runs.ghost} is not null`.mapWith(Boolean),
    at: runs.updatedAt,
  };

  const top = await db
    .select(columns)
    .from(runs)
    .where(eq(runs.worldId, id))
    // The tie-break matters: without it two identical times swap places
    // between requests and the board looks like it is flickering.
    .orderBy(asc(runs.timeMs), asc(runs.updatedAt))
    .limit(limit);

  // The caller's own row and rank, which is the half of a leaderboard that
  // keeps somebody playing once they are off the bottom of the top ten.
  let me: (typeof top)[number] | null = null;
  let rank: number | null = null;

  if (userId) {
    const [mine] = await db
      .select(columns)
      .from(runs)
      .where(and(eq(runs.worldId, id), eq(runs.userId, userId)));
    if (mine) {
      me = mine;
      const [{ ahead }] = await db
        .select({ ahead: sql<number>`count(*)`.mapWith(Number) })
        .from(runs)
        .where(and(eq(runs.worldId, id), lt(runs.timeMs, mine.timeMs)));
      rank = ahead + 1;
    }
  }

  // The Author time travels with the board, because it is the only way the
  // client can draw a medal for a course it did not ship with: `medalFor`
  // takes a slug and returns null for every uuid there has ever been.
  return NextResponse.json({
    top,
    me,
    rank,
    authorMs: authorMsFor(id, course.floorMs),
  });
}

/**
 * POST /api/worlds/:id/runs — submit a finished run.
 *
 * Upserts, keeping the better time. The comparison is in SQL rather than a
 * read-then-write, because two tabs finishing at once would otherwise race and
 * the slower one could land last.
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const course = await raceable(id, userId);
  if (!course) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = submission.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid run" }, { status: 422 });
  }
  const { timeMs, ghost } = parsed.data;

  // A time under the course's own physical floor did not happen here. See
  // `floorMs` for what this does and does not claim to catch. This used to be
  // a slug lookup, which meant a course somebody built was the one board in
  // the game where a hand-written `fetch` with a small number in it landed
  // unchallenged; the floor now comes from the row for those.
  if (course.floorMs !== null && timeMs < course.floorMs) {
    return NextResponse.json({ error: "Impossible time" }, { status: 422 });
  }

  const user = await currentUser().catch(() => null);
  const name =
    user?.firstName?.trim() ||
    user?.username?.trim() ||
    user?.fullName?.trim() ||
    "Runner";

  const medal = medalForAuthor(authorMsFor(id, course.floorMs), timeMs);

  const [row] = await db
    .insert(runs)
    .values({
      worldId: id,
      userId,
      name,
      timeMs,
      medal,
      ghost: ghost ?? null,
    })
    .onConflictDoUpdate({
      target: [runs.worldId, runs.userId],
      set: {
        name: sql`excluded.name`,
        timeMs: sql`excluded.time_ms`,
        medal: sql`excluded.medal`,
        ghost: sql`excluded.ghost`,
        updatedAt: sql`now()`,
      },
      // Only when it is actually better. A slower run is not an error — it is
      // most runs — so the response below reports which happened rather than
      // failing, and the client uses that to decide whether to refetch.
      setWhere: sql`${runs.timeMs} > excluded.time_ms`,
    })
    .returning({ timeMs: runs.timeMs });

  return NextResponse.json({
    ok: true,
    improved: row !== undefined,
    best: row?.timeMs ?? null,
    medal,
    authorMs: authorMsFor(id, course.floorMs),
  });
}
