import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { worlds } from "@/lib/db/schema";
import { parseWorldDoc } from "@/lib/worlddoc";
import { parkourWorldDoc } from "@/lib/parkour";
import { buildBuiltInDoc, getBuiltInWorld } from "@/lib/built-in-worlds";
import { isUuid } from "@/lib/ids";
import { courseFloorFor, type CourseFloor } from "@/lib/course-floor";
import { desc, eq, sql } from "drizzle-orm";

// GET /api/worlds — list the signed-in user's worlds.
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Metadata only: a list endpoint has no business shipping every WorldDoc.
  const rows = await db
    .select({
      id: worlds.id,
      name: worlds.name,
      published: worlds.published,
      playCount: worlds.playCount,
      updatedAt: worlds.updatedAt,
      partCount: sql<number>`jsonb_array_length(${worlds.doc} -> 'parts')`
        .mapWith(Number),
    })
    .from(worlds)
    .where(eq(worlds.ownerId, userId))
    .orderBy(desc(worlds.updatedAt));
  return NextResponse.json(rows);
}

// POST /api/worlds — create a world.
//
// Three sources, in order of precedence: `from` remixes a built-in or a
// published world, `doc` claims a draft built without an account, and neither
// seeds the default parkour course (SPEC §9 #5: never drop a new user into a
// blank void).
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  // `from` remixes an existing world into a row the caller owns: a built-in
  // slug (the only way to edit one, since those are generated and read-only)
  // or the id of any published world. SPEC §9 #4 calls remix the strongest UGC
  // retention driver, and it's nearly free once the doc is already a value.
  const from = typeof body?.from === "string" ? body.from : undefined;
  const builtIn = from ? getBuiltInWorld(from) : undefined;

  // Generate the row id up front so it can be embedded in the WorldDoc itself
  // (the doc's `id` and the row's primary key must match — e.g. for /build/[id]).
  const id = crypto.randomUUID();

  let seed;
  let sourceName: string | undefined;
  // The floor of whatever is being copied, when there is one to copy. A remix
  // changes the doc's id, ownerId and name and nothing the solver reads, so a
  // source row's fingerprint still matches and the clone costs a hash rather
  // than a Dijkstra. Everything else here starts with no floor and solves once.
  let sourceFloor: CourseFloor | null = null;

  if (builtIn) {
    seed = buildBuiltInDoc(builtIn.slug, userId)!;
    sourceName = builtIn.name;
  } else if (from) {
    // Only published worlds can be remixed — anything else must 404 rather
    // than reveal that a private world exists. The uuid check comes first:
    // `from` is caller-supplied, and a non-uuid would be a query error.
    if (!isUuid(from)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const [src] = await db.select().from(worlds).where(eq(worlds.id, from));
    if (!src || src.published !== 1) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    seed = src.doc;
    sourceName = src.name;
    sourceFloor = { floorKey: src.floorKey, floorMs: src.floorMs };
  } else if (body?.doc) {
    // Claiming a local draft: someone built without an account and has just
    // signed in to keep it. The doc is caller-supplied, so it is validated
    // below with the id and ownerId pinned server-side like any other write.
    seed = body.doc;
  } else {
    seed = parkourWorldDoc(id, userId, "Untitled World");
  }

  const name =
    typeof body?.name === "string" && body.name.trim()
      ? body.name.trim()
      : sourceName
        ? `${sourceName} (remix)`
        : typeof (seed as { name?: unknown })?.name === "string" &&
            (seed as { name: string }).name.trim()
          ? (seed as { name: string }).name.trim()
          : "Untitled World";

  let doc;
  try {
    doc = parseWorldDoc({ ...seed, id, ownerId: userId, name });
  } catch {
    // Only reachable from a claimed draft: everything else is generated here.
    return NextResponse.json({ error: "Invalid WorldDoc" }, { status: 422 });
  }

  // Derived here and never taken from the document — see `lib/course-floor.ts`.
  // A new row has no runs, so there is no board for a moved floor to cost.
  const { floorKey, floorMs } = courseFloorFor(doc, sourceFloor);

  const [row] = await db
    .insert(worlds)
    .values({ id, ownerId: userId, name, doc, floorKey, floorMs })
    .returning();

  return NextResponse.json(row, { status: 201 });
}
