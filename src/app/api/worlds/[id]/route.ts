import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { runs, worlds } from "@/lib/db/schema";
import { parseWorldDoc } from "@/lib/worlddoc";
import { buildBuiltInDoc, isBuiltInWorld } from "@/lib/built-in-worlds";
import { isUuid } from "@/lib/ids";
import { courseFloorFor, floorMoved } from "@/lib/course-floor";

type Params = { params: Promise<{ id: string }> };

/** Matches the downscale target in lib/canvas-thumbnail.ts's captureThumbnail. */
const THUMBNAIL_MAX_LENGTH = 200_000;

/**
 * GET /api/worlds/:id
 *
 * Readable without signing in when the world is a built-in or has been
 * published — that's what makes a shared link work for the person you sent it
 * to (SPEC §9 #4). Unpublished worlds stay owner-only.
 */
export async function GET(_req: Request, { params }: Params) {
  const { userId } = await auth();
  const { id } = await params;

  // Built-ins are generated, not stored. This has to come before the query:
  // `worlds.id` is a uuid column, so a slug like "parkour" is a Postgres error
  // rather than an empty result.
  const builtIn = buildBuiltInDoc(id, userId ?? "");
  if (builtIn) {
    return NextResponse.json({
      id,
      ownerId: userId ?? "",
      name: builtIn.name,
      doc: builtIn,
      builtIn: true,
      published: 1,
    });
  }

  // Anything that isn't a uuid can't be a row id, and querying one would be a
  // Postgres type error rather than a miss — so a bad link 404s, never 500s.
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [row] = await db.select().from(worlds).where(eq(worlds.id, id));

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isOwner = Boolean(userId) && row.ownerId === userId;
  if (!isOwner && row.published !== 1) {
    // 404 rather than 403: a private world shouldn't confirm it exists.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ...row, isOwner });
}

/** PUT /api/worlds/:id — save the whole WorldDoc. */
export async function PUT(req: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (isBuiltInWorld(id)) {
    return NextResponse.json(
      { error: "Built-in worlds are read-only. Remix it to make it yours." },
      { status: 403 }
    );
  }
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.doc) {
    return NextResponse.json({ error: "Missing doc" }, { status: 400 });
  }

  // Never trust the client's id/ownerId — pin both server-side before validating,
  // so a caller can't reassign someone else's world to themselves.
  let doc;
  try {
    doc = parseWorldDoc({ ...body.doc, id, ownerId: userId });
  } catch {
    return NextResponse.json({ error: "Invalid WorldDoc" }, { status: 422 });
  }

  const name =
    typeof body.name === "string" && body.name.trim() ? body.name.trim() : doc.name;

  // A capture failure (no WebGL context yet, a tainted canvas) sends null —
  // leave whatever thumbnail the world already has rather than blanking it.
  // The cap matches lib/canvas-thumbnail.ts's own downscale target; anything
  // past it didn't come from that helper, so it's dropped rather than trusted.
  const thumbnailUrl =
    typeof body.thumbnail === "string" &&
    body.thumbnail.startsWith("data:image/") &&
    body.thumbnail.length <= THUMBNAIL_MAX_LENGTH
      ? body.thumbnail
      : undefined;

  // The floor this world already has, so an edit that does not move it can
  // skip the solver. Scoped to the owner for the same reason the update below
  // is: a row belonging to somebody else must not answer questions.
  const [before] = await db
    .select({ floorKey: worlds.floorKey, floorMs: worlds.floorMs })
    .from(worlds)
    .where(and(eq(worlds.id, id), eq(worlds.ownerId, userId)));

  // The 404 has to come BEFORE the solve, not after it. `courseFloorFor` on a
  // world at the 50,000-part cap is about two seconds of Dijkstra, and letting
  // an unauthorised PUT buy that much CPU before being told no is a request
  // anybody can make in a loop. The update below would have 404'd anyway; this
  // only moves the answer in front of the expensive part.
  if (!before) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { floorKey, floorMs } = courseFloorFor(doc, before);

  // The ownerId in the WHERE clause is the authorisation check: a row belonging
  // to someone else simply matches nothing rather than leaking its existence.
  const [row] = await db
    .update(worlds)
    .set({
      doc: { ...doc, name },
      name,
      floorKey,
      floorMs,
      ...(thumbnailUrl !== undefined && { thumbnailUrl }),
      updatedAt: new Date(),
    })
    .where(and(eq(worlds.id, id), eq(worlds.ownerId, userId)))
    .returning();

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // The board rule, in one line an author can be told: an edit that moves the
  // course's floor resets its times, and every other edit leaves them alone.
  // The times on a board have to be times on the course as it is now — but a
  // repaint, a rotation or a prop drag provably cannot move the floor (see
  // `courseKey`), so an author tidying a world never destroys anybody's run.
  const boardReset = floorMoved(before.floorMs, floorMs);
  if (boardReset) await db.delete(runs).where(eq(runs.worldId, id));

  return NextResponse.json({ ...row, boardReset });
}

/**
 * PATCH /api/worlds/:id — metadata only.
 *
 * Separate from PUT because publishing shouldn't require the client to hold
 * and round-trip the entire WorldDoc just to flip one integer.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (isBuiltInWorld(id)) {
    return NextResponse.json(
      { error: "Built-in worlds are read-only." },
      { status: 403 }
    );
  }
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (typeof body?.published !== "boolean") {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const [row] = await db
    .update(worlds)
    .set({ published: body.published ? 1 : 0, updatedAt: new Date() })
    .where(and(eq(worlds.id, id), eq(worlds.ownerId, userId)))
    .returning();

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(row);
}

/** DELETE /api/worlds/:id */
export async function DELETE(_req: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (isBuiltInWorld(id)) {
    return NextResponse.json(
      { error: "Built-in worlds can't be deleted." },
      { status: 403 }
    );
  }
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [row] = await db
    .delete(worlds)
    .where(and(eq(worlds.id, id), eq(worlds.ownerId, userId)))
    .returning();

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
